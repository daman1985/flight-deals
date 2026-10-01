/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
"""Persistence invariants for keeping health separate from fares."""

import json
from datetime import date, datetime, timezone

import httpx

from fare_worker.detector import DetectionThresholds, evaluate_cabin_spreads
from fare_worker.models import (
    Cabin,
    FareOffer,
    FareSearchRequest,
    FareSearchResponse,
    SearchHealth,
    SearchStatus,
)
from fare_worker.persistence import SupabaseRestStore

WATCH_ID = "00000000-0000-4000-8000-000000000001"


def _detector_offer(cabin: Cabin, price: float) -> FareOffer:
    return FareOffer(
        provider="fixture",
        origin="YVR",
        destination="SNA",
        departure_date=date(2026, 11, 12),
        return_date=date(2026, 11, 16),
        cabin=cabin,
        total_price=price,
        currency="CAD",
        flight_numbers=[f"FX-{cabin.value}"],
        stops_outbound=0,
        stops_return=0,
        duration_outbound_minutes=180,
        duration_return_minutes=180,
        observed_at=datetime(2026, 9, 29, tzinfo=timezone.utc),
    )


def test_modern_secret_key_is_not_sent_as_a_bearer_token() -> None:
    """Opaque `sb_secret_` keys belong only in Supabase's API-key header."""
    store = SupabaseRestStore(
        "https://example.supabase.co",
        "sb_secret_example",
    )
    try:
        assert store._client.headers["apikey"] == "sb_secret_example"
        assert "authorization" not in store._client.headers
    finally:
        store.close()


def test_legacy_service_role_key_keeps_bearer_compatibility() -> None:
    """JWT-based service-role keys still require the legacy Bearer header."""
    store = SupabaseRestStore(
        "https://example.supabase.co",
        "legacy-service-role-jwt",
    )
    try:
        assert store._client.headers["apikey"] == "legacy-service-role-jwt"
        assert store._client.headers["authorization"] == (
            "Bearer legacy-service-role-jwt"
        )
    finally:
        store.close()


def test_failure_response_cannot_contain_fares() -> None:
    """The model rejects a failure that could otherwise look like a fare."""
    request = FareSearchRequest(
        origin="YVR",
        destination="SNA",
        departure_date=date(2026, 11, 12),
        return_date=date(2026, 11, 16),
        cabin=Cabin.BUSINESS,
        passengers=1,
    )
    response = FareSearchResponse(
        request=request,
        offers=[],
        health=SearchHealth(
            status=SearchStatus.PROVIDER_FAILURE,
            result_count=0,
            completeness=0,
            retries=0,
            provider_error_code="SearchParseError",
            latency_ms=10,
        ),
    )

    assert response.offers == []
    assert response.health.status is SearchStatus.PROVIDER_FAILURE


def test_rest_paths_stay_under_postgrest_base_url() -> None:
    """A leading resource slash must not discard the `/rest/v1` base path."""
    observed_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        observed_paths.append(request.url.path)
        return httpx.Response(204)

    store = SupabaseRestStore("https://example.supabase.co", "test-secret")
    store._client.close()
    store._client = httpx.Client(
        base_url="https://example.supabase.co/rest/v1/",
        transport=httpx.MockTransport(handler),
    )

    try:
        store.ensure_exact_test_watch(
            watch_id="00000000-0000-4000-8000-000000000001",
            user_id="00000000-0000-4000-8000-000000000002",
            departure_date="2026-11-12",
            return_date="2026-11-16",
        )
    finally:
        store.close()

    assert observed_paths == ["/rest/v1/watches"]


def test_claim_due_candidates_uses_worker_only_rpc() -> None:
    observed_requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        observed_requests.append(request)
        return httpx.Response(200, json=[])

    store = SupabaseRestStore("https://example.supabase.co", "test-secret")
    store._client.close()
    store._client = httpx.Client(
        base_url="https://example.supabase.co/rest/v1/",
        transport=httpx.MockTransport(handler),
    )

    try:
        claimed = store.claim_due_candidates(
            limit=3,
            lease_token="00000000-0000-4000-8000-000000000010",
        )
    finally:
        store.close()

    assert claimed == []
    assert observed_requests[0].url.path == (
        "/rest/v1/rpc/claim_due_search_candidates"
    )
    assert json.loads(observed_requests[0].content)["p_limit"] == 3


def test_anomaly_persistence_uses_idempotent_primary_key_upsert() -> None:
    comparison = evaluate_cabin_spreads(
        WATCH_ID,
        [
            _detector_offer(Cabin.ECONOMY, 1000),
            _detector_offer(Cabin.PREMIUM_ECONOMY, 1100),
        ],
        DetectionThresholds(pe_near_inversion_pct=15),
    )[0]
    observed_requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        observed_requests.append(request)
        payload = json.loads(request.content)
        return httpx.Response(200, json=[{"id": payload[0]["id"]}])

    store = SupabaseRestStore("https://example.supabase.co", "test-secret")
    store._client.close()
    store._client = httpx.Client(
        base_url="https://example.supabase.co/rest/v1/",
        transport=httpx.MockTransport(handler),
    )

    try:
        persisted, resolved = store.persist_comparison_results(
            WATCH_ID,
            [comparison],
        )
    finally:
        store.close()

    assert (persisted, resolved) == (1, 0)
    assert observed_requests[0].method == "POST"
    assert observed_requests[0].url.path == "/rest/v1/anomalies"
    assert observed_requests[0].url.params["on_conflict"] == "id"
    assert "confirmed_at" not in json.loads(observed_requests[0].content)[0]


def test_complete_non_anomalous_pair_resolves_existing_signal() -> None:
    comparison = evaluate_cabin_spreads(
        WATCH_ID,
        [
            _detector_offer(Cabin.ECONOMY, 800),
            _detector_offer(Cabin.PREMIUM_ECONOMY, 1000),
        ],
        DetectionThresholds(pe_near_inversion_pct=15),
    )[0]
    observed_requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        observed_requests.append(request)
        return httpx.Response(200, json=[{"id": comparison.anomaly_id}])

    store = SupabaseRestStore("https://example.supabase.co", "test-secret")
    store._client.close()
    store._client = httpx.Client(
        base_url="https://example.supabase.co/rest/v1/",
        transport=httpx.MockTransport(handler),
    )

    try:
        persisted, resolved = store.persist_comparison_results(
            WATCH_ID,
            [comparison],
        )
    finally:
        store.close()

    assert (persisted, resolved) == (0, 1)
    assert observed_requests[0].method == "PATCH"
    assert observed_requests[0].url.params["id"] == f"eq.{comparison.anomaly_id}"
    assert observed_requests[0].url.params["resolved_at"] == "is.null"


def test_detection_loader_does_not_reuse_an_older_valid_run() -> None:
    observed_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        observed_paths.append(request.url.path)
        if request.url.path.endswith("/watches"):
            return httpx.Response(
                200,
                json=[
                    {
                        "pe_near_inversion_pct": 15,
                        "business_vs_pe_pct": 30,
                        "max_duration_minutes": None,
                    }
                ],
            )
        if request.url.path.endswith("/search_runs"):
            return httpx.Response(
                200,
                json=[
                    {
                        "id": "00000000-0000-4000-8000-000000000011",
                        "candidate_id": "00000000-0000-4000-8000-000000000021",
                        "status": "NO_RESULT",
                        "finished_at": "2026-09-29T20:00:00+00:00",
                    },
                    {
                        "id": "00000000-0000-4000-8000-000000000012",
                        "candidate_id": "00000000-0000-4000-8000-000000000021",
                        "status": "VALID_RESULT",
                        "finished_at": "2026-09-29T19:00:00+00:00",
                    },
                ],
            )
        raise AssertionError("Fare observations must not be loaded for a stale run")

    store = SupabaseRestStore("https://example.supabase.co", "test-secret")
    store._client.close()
    store._client = httpx.Client(
        base_url="https://example.supabase.co/rest/v1/",
        transport=httpx.MockTransport(handler),
    )

    try:
        thresholds, offers = store.load_detection_input(WATCH_ID)
    finally:
        store.close()

    assert thresholds.pe_near_inversion_pct == 15
    assert offers == []
    assert observed_paths == ["/rest/v1/watches", "/rest/v1/search_runs"]


def test_reconfirmation_persistence_records_provenance_without_changing_schedule() -> None:
    observed_requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        observed_requests.append(request)
        if request.url.path.endswith("/search_runs"):
            return httpx.Response(200, json=[{"id": "run-confirmation"}])
        assert request.url.path.endswith("/fare_observations")
        return httpx.Response(204)

    store = SupabaseRestStore("https://example.supabase.co", "test-secret")
    store._client.close()
    store._client = httpx.Client(base_url="https://example.supabase.co/rest/v1/",
        transport=httpx.MockTransport(handler))
    offer = _detector_offer(Cabin.ECONOMY, 1000)
    request = FareSearchRequest(origin=offer.origin, destination=offer.destination,
        departure_date=offer.departure_date, return_date=offer.return_date, cabin=offer.cabin)
    response = FareSearchResponse(request=request, offers=[offer], health=SearchHealth(
        status=SearchStatus.VALID_RESULT, result_count=1, completeness=1, latency_ms=1))
    try:
        result = store.persist_response(watch_id=WATCH_ID, candidate_id="candidate-id",
            response=response, started_at=offer.observed_at, update_candidate=False,
            reconfirmation_anomaly_id="anomaly-id", reconfirmation_lease_token="lease-id")
    finally:
        store.close()
    assert result == "run-confirmation"
    assert len(observed_requests) == 2
    run = json.loads(observed_requests[0].content)
    assert run["reconfirmation_anomaly_id"] == "anomaly-id"
    assert run["reconfirmation_lease_token"] == "lease-id"
    evidence = json.loads(observed_requests[1].content)[0]
    assert evidence["quality_eligible"] is True
    assert evidence["confirmed"] is False  # Atomic DB finalization sets this only after both cabins verify.
