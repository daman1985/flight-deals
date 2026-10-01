/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
"""Plan and process one bounded rotation of due fare searches."""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from .detector_flow import analyze_watch
from .models import FareSearchRequest, SearchStatus
from .persistence import SupabaseRestStore
from .planner import active_departure_window, plan_candidate_batch
from .providers import FliProvider
from .reconfirmation import run_reconfirmation_batch


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _positive_int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    value = int(raw)
    if value < 1:
        raise RuntimeError(f"{name} must be positive")
    return value


def next_scan_time(
    *,
    priority: int,
    status: SearchStatus,
    finished_at: datetime,
) -> datetime:
    """Schedule healthy work by urgency and retry provider trouble conservatively."""
    if status in {SearchStatus.PROVIDER_FAILURE, SearchStatus.THROTTLED}:
        return finished_at + timedelta(hours=2)
    if status in {SearchStatus.NO_RESULT, SearchStatus.INCOMPLETE_RESULT}:
        return finished_at + timedelta(hours=12)
    if priority >= 100:
        return finished_at + timedelta(hours=6)
    if priority >= 60:
        return finished_at + timedelta(hours=12)
    if priority >= 30:
        return finished_at + timedelta(hours=24)
    return finished_at + timedelta(hours=48)


def run_rotation(
    store: SupabaseRestStore,
    provider: FliProvider,
    *,
    as_of: date,
    planning_limit_per_watch: int,
    batch_size: int,
) -> tuple[int, int, int]:
    """Persist planning progress, claim due work, and process it sequentially."""
    watch_rows = store.load_active_watches()
    watches_by_id = {str(row["id"]): row for row in watch_rows}
    planned_count = 0
    for row in watch_rows:
        watch = store.watch_plan_from_row(row)
        cursor = store.load_planning_cursor(watch.id)
        try:
            first_departure, last_departure = active_departure_window(
                watch,
                as_of=as_of,
            )
            batch = plan_candidate_batch(
                watch,
                as_of=as_of,
                cursor=cursor,
                candidate_limit=planning_limit_per_watch,
            )
        except ValueError as exc:
            print(f"planner: skipped watch={watch.id}; reason={exc}")
            continue
        store.deactivate_candidates_outside_window(
            watch_id=watch.id,
            first_departure=first_departure,
            last_departure=last_departure,
        )
        store.persist_planning_batch(
            watch_id=watch.id,
            candidates=batch.candidates,
            next_cursor=batch.next_cursor,
        )
        planned_count += len(batch.candidates)

    lease_token = str(uuid4())
    claimed = store.claim_due_candidates(
        limit=batch_size,
        lease_token=lease_token,
    )
    scanned_watch_ids: set[str] = set()
    for candidate in claimed:
        candidate_id = str(candidate["id"])
        watch_id = str(candidate["watch_id"])
        watch = watches_by_id.get(watch_id)
        if watch is None:
            store.release_candidate(candidate_id, lease_token)
            continue

        request = FareSearchRequest(
            origin=candidate["origin"],
            destination=candidate["destination"],
            departure_date=date.fromisoformat(candidate["departure_date"]),
            return_date=(
                date.fromisoformat(candidate["return_date"])
                if candidate["return_date"]
                else None
            ),
            cabin=candidate["cabin"],
            passengers=watch["passengers"],
            max_stops=watch["max_stops"],
            currency="CAD",
        )
        started_at = datetime.now(timezone.utc)
        try:
            response = provider.search(request)
            finished_at = datetime.now(timezone.utc)
            run_id = store.persist_response(
                watch_id=watch_id,
                candidate_id=candidate_id,
                response=response,
                started_at=started_at,
                lease_token=lease_token,
                next_scan_at=next_scan_time(
                    priority=int(candidate["priority"]),
                    status=response.health.status,
                    finished_at=finished_at,
                ),
            )
        except Exception:
            store.release_candidate(candidate_id, lease_token)
            raise

        scanned_watch_ids.add(watch_id)
        print(
            f"scan: {request.origin}-{request.destination} "
            f"{request.departure_date}/{request.return_date} {request.cabin.value}; "
            f"status={response.health.status.value}; "
            f"offers={response.health.result_count}; run={run_id}"
        )

    for watch_id in sorted(scanned_watch_ids):
        comparisons, detected, resolved = analyze_watch(store, watch_id)
        print(
            f"detector: watch={watch_id}; comparisons={comparisons}; "
            f"detected={detected}; resolved={resolved}"
        )

    return planned_count, len(claimed), len(scanned_watch_ids)


def main() -> None:
    """Run one scheduler-safe rotation using server-only environment values."""
    store = SupabaseRestStore(
        _required_env("NEXT_PUBLIC_SUPABASE_URL"),
        _required_env("SUPABASE_SECRET_KEY"),
    )
    try:
        provider = FliProvider()
        # Retry already queued signals before regular scans; newly detected
        # signals wait for a later rotation and their persisted not-before time.
        checked, confirmed = run_reconfirmation_batch(store, provider, limit=1)
        print(f"reconfirmation: checked={checked}; confirmed={confirmed}")
        planned, scanned, analyzed = run_rotation(
            store,
            provider,
            as_of=datetime.now(timezone.utc).date(),
            planning_limit_per_watch=_positive_int_env(
                "FARE_PLANNING_LIMIT_PER_WATCH",
                60,
            ),
            batch_size=_positive_int_env("FARE_SCAN_BATCH_SIZE", 3),
        )
        print(
            f"rotation: planned={planned}; scanned={scanned}; "
            f"analyzed_watches={analyzed}"
        )
    finally:
        store.close()


if __name__ == "__main__":
    main()
