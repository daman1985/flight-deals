"""Adapter from the current `fli` library to provider-neutral fare models."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from datetime import datetime, timezone
from time import perf_counter
from typing import Any

from fare_worker.models import (
    Cabin,
    FareOffer,
    FareSearchRequest,
    FareSearchResponse,
    SearchHealth,
    SearchStatus,
)

SerializedResult = Mapping[str, Any]


class FliProvider:
    """Perform a single low-concurrency search through `fli`."""

    name = "fli"

    def __init__(
        self,
        search_callable: Callable[[FareSearchRequest], Any] | None = None,
    ) -> None:
        """Allow a fixture callable in tests without importing live provider code."""
        self._search_callable = search_callable or self._search_fli

    def search(self, request: FareSearchRequest) -> FareSearchResponse:
        """Search and normalize one request without adapter-level retries."""
        started = perf_counter()
        try:
            raw_results = self._search_callable(request)
            latency_ms = round((perf_counter() - started) * 1000)
            serialized = _serialize_results(raw_results)
            return normalize_fli_results(
                request,
                serialized,
                observed_at=datetime.now(timezone.utc),
                latency_ms=latency_ms,
            )
        except Exception as exc:  # Provider exceptions are classified below.
            latency_ms = round((perf_counter() - started) * 1000)
            status, code = _classify_provider_exception(exc)
            return FareSearchResponse(
                request=request,
                offers=[],
                health=SearchHealth(
                    status=status,
                    result_count=0,
                    completeness=0,
                    retries=0,
                    provider_error_code=code,
                    provider_error_message=str(exc)[:500] or type(exc).__name__,
                    latency_ms=latency_ms,
                ),
            )

    @staticmethod
    def _search_fli(request: FareSearchRequest) -> Any:
        """Translate the normalized request into the current `fli` API."""
        from fli.models import (  # Imported lazily to keep unit tests offline.
            Airport,
            FlightSearchFilters,
            FlightSegment,
            MaxStops,
            PassengerInfo,
            SeatType,
            SortBy,
            TripType,
        )
        from fli.search import SearchFlights

        origin = Airport[request.origin]
        destination = Airport[request.destination]
        segments = [
            FlightSegment(
                departure_airport=[[origin, 0]],
                arrival_airport=[[destination, 0]],
                travel_date=request.departure_date.isoformat(),
            )
        ]

        trip_type = TripType.ONE_WAY
        if request.return_date is not None:
            trip_type = TripType.ROUND_TRIP
            segments.append(
                FlightSegment(
                    departure_airport=[[destination, 0]],
                    arrival_airport=[[origin, 0]],
                    travel_date=request.return_date.isoformat(),
                )
            )

        stops = {
            None: MaxStops.ANY,
            0: MaxStops.NON_STOP,
            1: MaxStops.ONE_STOP_OR_FEWER,
            2: MaxStops.TWO_OR_FEWER_STOPS,
        }[request.max_stops]

        filters = FlightSearchFilters(
            trip_type=trip_type,
            passenger_info=PassengerInfo(adults=request.passengers),
            flight_segments=segments,
            seat_type=SeatType[request.cabin.value],
            stops=stops,
            sort_by=SortBy.CHEAPEST,
        )

        if request.return_date is not None:
            # Round trips cost 1 + top_n page fetches. Keep the proof at two fetches.
            return SearchFlights().search(filters, top_n=1, currency=request.currency)
        return SearchFlights().search(filters, currency=request.currency)


def normalize_fli_results(
    request: FareSearchRequest,
    results: list[SerializedResult] | None,
    *,
    observed_at: datetime,
    latency_ms: int,
) -> FareSearchResponse:
    """Normalize serialized `fli` rows and classify response completeness."""
    if results is None:
        return _empty_response(request, SearchStatus.NO_RESULT, latency_ms, completeness=1)
    if not results:
        return _empty_response(request, SearchStatus.INCOMPLETE_RESULT, latency_ms)

    offers: list[FareOffer] = []
    for entry in results:
        offer = _normalize_entry(request, entry, observed_at)
        if offer is not None:
            offers.append(offer)

    completeness = len(offers) / len(results)
    if not offers:
        return _empty_response(
            request,
            SearchStatus.INCOMPLETE_RESULT,
            latency_ms,
            completeness=completeness,
        )

    return FareSearchResponse(
        request=request,
        offers=offers,
        health=SearchHealth(
            status=SearchStatus.VALID_RESULT,
            result_count=len(offers),
            completeness=completeness,
            retries=0,
            latency_ms=latency_ms,
        ),
    )


def _normalize_entry(
    request: FareSearchRequest,
    entry: SerializedResult,
    observed_at: datetime,
) -> FareOffer | None:
    outbound = entry.get("outbound")
    inbound = entry.get("return")
    if not isinstance(outbound, Mapping):
        return None

    outbound_legs = outbound.get("legs")
    if not isinstance(outbound_legs, list) or not outbound_legs:
        return None
    if request.return_date is not None:
        if not isinstance(inbound, Mapping):
            return None
        inbound_legs = inbound.get("legs")
        if not isinstance(inbound_legs, list) or not inbound_legs:
            return None
    else:
        inbound_legs = []

    price = outbound.get("price")
    if not isinstance(price, (int, float)) or isinstance(price, bool) or price <= 0:
        return None

    currency = outbound.get("currency") or request.currency
    flight_numbers = [
        str(leg.get("flight_number"))
        for leg in [*outbound_legs, *inbound_legs]
        if isinstance(leg, Mapping) and leg.get("flight_number")
    ]
    airline = _airline_code(outbound, outbound_legs)

    booking_url = outbound.get("booking_url")
    if booking_url is not None and not isinstance(booking_url, str):
        booking_url = None

    return FareOffer(
        provider="fli",
        origin=request.origin,
        destination=request.destination,
        departure_date=request.departure_date,
        return_date=request.return_date,
        cabin=request.cabin,
        total_price=float(price),
        currency=str(currency).upper(),
        airline=airline,
        flight_numbers=flight_numbers,
        stops_outbound=_optional_nonnegative_int(outbound.get("stops")),
        stops_return=(
            _optional_nonnegative_int(inbound.get("stops"))
            if isinstance(inbound, Mapping)
            else None
        ),
        duration_outbound_minutes=_optional_nonnegative_int(outbound.get("duration")),
        duration_return_minutes=(
            _optional_nonnegative_int(inbound.get("duration"))
            if isinstance(inbound, Mapping)
            else None
        ),
        booking_url=booking_url,
        observed_at=observed_at,
        raw_payload=dict(entry),
    )


def _airline_code(outbound: Mapping[str, Any], legs: Sequence[Any]) -> str | None:
    primary = outbound.get("primary_airline")
    if isinstance(primary, str) and primary:
        return primary
    first_leg = legs[0] if legs else None
    if isinstance(first_leg, Mapping):
        airline = first_leg.get("airline")
        if isinstance(airline, str) and airline:
            return airline
    return None


def _optional_nonnegative_int(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def _serialize_results(raw_results: Any) -> list[SerializedResult] | None:
    if raw_results is None:
        return None
    if not isinstance(raw_results, list):
        raise TypeError("fli returned an unexpected top-level response")

    serialized: list[SerializedResult] = []
    for item in raw_results:
        if isinstance(item, tuple):
            if not item:
                serialized.append({})
                continue
            serialized.append(
                {
                    "outbound": _model_to_mapping(item[0]),
                    "return": _model_to_mapping(item[1]) if len(item) > 1 else None,
                }
            )
        else:
            serialized.append({"outbound": _model_to_mapping(item), "return": None})
    return serialized


def _model_to_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        dumped = model_dump(mode="json")
        if isinstance(dumped, Mapping):
            return dumped
    raise TypeError("fli returned a result that cannot be serialized")


def _empty_response(
    request: FareSearchRequest,
    status: SearchStatus,
    latency_ms: int,
    *,
    completeness: float = 0,
) -> FareSearchResponse:
    return FareSearchResponse(
        request=request,
        offers=[],
        health=SearchHealth(
            status=status,
            result_count=0,
            completeness=completeness,
            retries=0,
            latency_ms=latency_ms,
        ),
    )


def _classify_provider_exception(exc: Exception) -> tuple[SearchStatus, str]:
    name = type(exc).__name__
    status_code = getattr(exc, "status_code", None)
    rejection_code = getattr(exc, "code", None)
    if status_code == 429 or rejection_code == 8:
        return SearchStatus.THROTTLED, f"{name}:{status_code or rejection_code}"
    return SearchStatus.PROVIDER_FAILURE, name
