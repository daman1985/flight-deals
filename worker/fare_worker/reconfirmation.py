/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
"""Bounded, durable re-search before publishing any in-app fare alert."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Protocol
from uuid import uuid4

from .models import FareSearchRequest, FareSearchResponse, SearchHealth, SearchStatus
from .detector import DetectionThresholds, evaluate_cabin_spreads
from .persistence import SupabaseRestStore


class SearchProvider(Protocol):
    def search(self, request: FareSearchRequest) -> FareSearchResponse: ...


def _failure(request: FareSearchRequest, code: str) -> FareSearchResponse:
    return FareSearchResponse(request=request, offers=[], health=SearchHealth(
        status=SearchStatus.PROVIDER_FAILURE, result_count=0, completeness=0,
        latency_ms=0, provider_error_code=code,
    ))


def validated_response(
    request: FareSearchRequest, response: FareSearchResponse,
) -> FareSearchResponse:
    """Reject provider responses for a different request before storing evidence."""
    if response.request != request:
        return _failure(request, "CONFIRMATION_REQUEST_MISMATCH")
    for offer in response.offers:
        if (offer.origin, offer.destination, offer.departure_date, offer.return_date,
            offer.cabin, offer.currency) != (
            request.origin, request.destination, request.departure_date,
            request.return_date, request.cabin, request.currency,
        ):
            return _failure(request, "CONFIRMATION_OFFER_MISMATCH")
    return response


def is_reconfirmation_eligible(job: dict[str, Any], responses: list[FareSearchResponse]) -> bool:
    """Reuse deterministic detection rules on this attempt's complete evidence."""
    if len(responses) != 2 or any(
        r.health.status is not SearchStatus.VALID_RESULT or r.health.completeness != 1
        for r in responses
    ):
        return False
    anomaly = job["anomaly_snapshot"]
    watch = job["watch_snapshot"]
    max_stops = watch["max_stops"]
    offers = [offer for response in responses for offer in response.offers
        if max_stops is None or (
            offer.stops_outbound is not None and offer.stops_outbound <= max_stops
            and (offer.return_date is None or (
                offer.stops_return is not None and offer.stops_return <= max_stops
            ))
        )]
    comparisons = evaluate_cabin_spreads(anomaly["watch_id"], offers, DetectionThresholds(
        pe_near_inversion_pct=float(watch["pe_near_inversion_pct"]),
        business_vs_pe_pct=float(watch["business_vs_pe_pct"]),
        max_duration_minutes=watch["max_duration_minutes"],
    ))
    return any(c.anomaly_id == job["anomaly_id"] and c.anomaly_type is not None
        and c.anomaly_type.value == anomaly["type"] for c in comparisons)


def run_reconfirmation_batch(
    store: SupabaseRestStore, provider: SearchProvider, *, limit: int = 1,
) -> tuple[int, int]:
    """Re-search at most two cabins per job; the database validates the rule.

    A crash after writing either attempt is safe: the lease expires and another
    attempt uses a new token. Only evidence from the currently owned lease can
    confirm. A lost completion response is safe because alert insertion dedupes.
    """
    lease_token = str(uuid4())
    jobs = store.claim_reconfirmations(limit=limit, lease_token=lease_token)
    confirmed = 0
    for job in jobs:
        anomaly_id = job["anomaly_id"]
        anomaly = job["anomaly_snapshot"]
        watch = job["watch_snapshot"]
        run_ids: list[str] = []
        responses: list[FareSearchResponse] = []
        error_code = None
        try:
            for cabin in (anomaly["lower_cabin"], anomaly["higher_cabin"]):
                request = FareSearchRequest(
                    origin=anomaly["origin"], destination=anomaly["destination"],
                    departure_date=date.fromisoformat(anomaly["departure_date"]),
                    return_date=date.fromisoformat(anomaly["return_date"]) if anomaly["return_date"] else None,
                    cabin=cabin, passengers=watch["passengers"], max_stops=watch["max_stops"],
                    currency=anomaly["explanation_json"]["comparison_scope"]["currency"],
                )
                candidate_id = store.confirmation_candidate_id(anomaly["watch_id"], request)
                started_at = datetime.now(timezone.utc)
                try:
                    response = validated_response(request, provider.search(request))
                except Exception as exc:
                    # Provider diagnostics must not include exception text that
                    # could contain URLs, headers or credentials.
                    response = _failure(request, type(exc).__name__)
                run_ids.append(store.persist_response(
                    watch_id=anomaly["watch_id"], candidate_id=candidate_id,
                    response=response, started_at=started_at, update_candidate=False,
                    reconfirmation_anomaly_id=anomaly_id,
                    reconfirmation_lease_token=lease_token,
                ))
                responses.append(response)
        except Exception as exc:
            error_code = type(exc).__name__
        eligible = is_reconfirmation_eligible(job, responses)
        outcome = store.finish_reconfirmation(
            anomaly_id=anomaly_id, lease_token=lease_token,
            lower_run_id=run_ids[0] if eligible else None,
            higher_run_id=run_ids[1] if eligible else None,
            error_code=error_code or (None if eligible else "NOT_RECONFIRMED"),
        )
        confirmed += outcome == "CONFIRMED"
        print(f"reconfirmation: anomaly={anomaly_id}; outcome={outcome}")
    return len(jobs), confirmed
