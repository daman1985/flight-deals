"""Offline tests for provider normalization and health classification."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

from fare_worker.models import Cabin, FareSearchRequest, SearchStatus
from fare_worker.providers.fli_adapter import FliProvider, normalize_fli_results

FIXTURES = Path(__file__).parents[1] / "fixtures"


def request() -> FareSearchRequest:
    return FareSearchRequest(
        origin="yvr",
        destination="sna",
        departure_date=date(2026, 11, 12),
        return_date=date(2026, 11, 16),
        cabin=Cabin.PREMIUM_ECONOMY,
        passengers=1,
        max_stops=0,
        currency="cad",
    )


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text())


def test_normalizes_valid_round_trip() -> None:
    response = normalize_fli_results(
        request(),
        load_fixture("valid_round_trip.json"),
        observed_at=datetime(2026, 9, 28, tzinfo=timezone.utc),
        latency_ms=421,
    )

    assert response.health.status is SearchStatus.VALID_RESULT
    assert response.health.completeness == 1
    assert response.health.result_count == 1
    offer = response.offers[0]
    assert offer.total_price == 982
    assert offer.currency == "CAD"
    assert offer.airline == "AC"
    assert offer.flight_numbers == ["AC552", "AC561"]
    assert offer.stops_outbound == 0
    assert offer.stops_return == 0
    assert offer.duration_outbound_minutes == 178
    assert offer.duration_return_minutes == 185


def test_empty_list_is_incomplete_not_a_price_change() -> None:
    response = normalize_fli_results(
        request(),
        [],
        observed_at=datetime.now(timezone.utc),
        latency_ms=25,
    )

    assert response.health.status is SearchStatus.INCOMPLETE_RESULT
    assert response.offers == []


def test_explicit_none_is_no_result() -> None:
    response = normalize_fli_results(
        request(),
        None,
        observed_at=datetime.now(timezone.utc),
        latency_ms=25,
    )

    assert response.health.status is SearchStatus.NO_RESULT
    assert response.health.completeness == 1
    assert response.offers == []


def test_missing_price_or_return_legs_is_incomplete() -> None:
    response = normalize_fli_results(
        request(),
        load_fixture("incomplete_round_trip.json"),
        observed_at=datetime.now(timezone.utc),
        latency_ms=25,
    )

    assert response.health.status is SearchStatus.INCOMPLETE_RESULT
    assert response.offers == []


def test_provider_failure_is_separate_from_results() -> None:
    class SearchParseError(Exception):
        pass

    def fail(_: FareSearchRequest):
        raise SearchParseError("provider response shape changed")

    response = FliProvider(search_callable=fail).search(request())

    assert response.health.status is SearchStatus.PROVIDER_FAILURE
    assert response.health.provider_error_code == "SearchParseError"
    assert response.offers == []


def test_rate_limit_is_classified_as_throttled() -> None:
    class SearchHTTPError(Exception):
        status_code = 429

    def throttle(_: FareSearchRequest):
        raise SearchHTTPError("too many requests")

    response = FliProvider(search_callable=throttle).search(request())

    assert response.health.status is SearchStatus.THROTTLED
    assert response.offers == []
