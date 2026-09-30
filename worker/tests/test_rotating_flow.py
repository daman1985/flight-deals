"""Scheduling policy tests for the bounded rotating worker."""

from datetime import datetime, timedelta, timezone

from fare_worker.models import SearchStatus
from fare_worker.rotating_flow import next_scan_time


def test_healthy_candidates_revisit_according_to_priority() -> None:
    finished_at = datetime(2026, 9, 29, 20, tzinfo=timezone.utc)

    assert next_scan_time(
        priority=100,
        status=SearchStatus.VALID_RESULT,
        finished_at=finished_at,
    ) == finished_at + timedelta(hours=6)
    assert next_scan_time(
        priority=30,
        status=SearchStatus.VALID_RESULT,
        finished_at=finished_at,
    ) == finished_at + timedelta(hours=24)


def test_provider_failure_retries_before_the_normal_rotation() -> None:
    finished_at = datetime(2026, 9, 29, 20, tzinfo=timezone.utc)

    assert next_scan_time(
        priority=10,
        status=SearchStatus.PROVIDER_FAILURE,
        finished_at=finished_at,
    ) == finished_at + timedelta(hours=2)
