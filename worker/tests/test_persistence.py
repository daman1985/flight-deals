"""Persistence invariants for keeping health separate from fares."""

from datetime import date, datetime, timezone

import httpx

from fare_worker.models import (
    Cabin,
    FareSearchRequest,
    FareSearchResponse,
    SearchHealth,
    SearchStatus,
)
from fare_worker.persistence import SupabaseRestStore


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
