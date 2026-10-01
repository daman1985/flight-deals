"""Development-only sequential YVR → SNA cross-cabin acquisition proof."""

from __future__ import annotations

import os
from datetime import date, datetime, timezone
from uuid import uuid4

from .detector_flow import analyze_watch
from .models import Cabin, FareSearchRequest
from .persistence import SupabaseRestStore
from .providers import FliProvider


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def main() -> None:
    """Run the three cabins sequentially and persist health separately."""
    supabase_url = _required_env("NEXT_PUBLIC_SUPABASE_URL")
    secret_key = _required_env("SUPABASE_SECRET_KEY")
    user_id = _required_env("TEST_USER_ID")
    watch_id = _required_env("TEST_WATCH_ID")
    departure_date = date.fromisoformat(_required_env("TEST_DEPARTURE_DATE"))
    return_date = date.fromisoformat(_required_env("TEST_RETURN_DATE"))

    store = SupabaseRestStore(supabase_url, secret_key)
    provider = FliProvider()
    acquisition_batch_id = str(uuid4())
    try:
        store.ensure_exact_test_watch(
            watch_id=watch_id,
            user_id=user_id,
            departure_date=departure_date.isoformat(),
            return_date=return_date.isoformat(),
        )

        for cabin in (Cabin.ECONOMY, Cabin.PREMIUM_ECONOMY, Cabin.BUSINESS):
            request = FareSearchRequest(
                origin="YVR",
                destination="SNA",
                departure_date=departure_date,
                return_date=return_date,
                cabin=cabin,
                passengers=1,
                max_stops=1,
                currency="CAD",
            )
            candidate_id = store.upsert_candidate(watch_id, request)
            started_at = datetime.now(timezone.utc)
            response = provider.search(request)
            run_id = store.persist_response(
                watch_id=watch_id,
                candidate_id=candidate_id,
                response=response,
                started_at=started_at,
                acquisition_batch_id=acquisition_batch_id,
            )
            print(
                f"{cabin.value}: {response.health.status.value}; "
                f"offers={response.health.result_count}; "
                f"completeness={response.health.completeness:.2f}; "
                f"latency_ms={response.health.latency_ms}; run={run_id}"
            )

        comparisons, detected, resolved = analyze_watch(store, watch_id)
        print(
            f"detector: comparisons={comparisons}; "
            f"detected={detected}; resolved={resolved}"
        )
    finally:
        store.close()


if __name__ == "__main__":
    main()
