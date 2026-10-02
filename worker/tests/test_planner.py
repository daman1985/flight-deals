"""Candidate planner coverage for every supported date mode."""

from datetime import date

from fare_worker.models import Cabin
from fare_worker.planner import (
    DateMode,
    PlanningCursor,
    WatchPlan,
    active_departure_window,
    plan_candidate_batch,
    priority_for_departure,
)


def _watch(date_mode: DateMode, **overrides: object) -> WatchPlan:
    values: dict[str, object] = {
        "id": "watch-1",
        "origin_airports": ("YVR",),
        "destination_airports": ("SNA",),
        "date_mode": date_mode,
        "cabins": (Cabin.ECONOMY, Cabin.BUSINESS),
    }
    values.update(overrides)
    return WatchPlan(**values)  # type: ignore[arg-type]


def test_exact_watch_expands_every_route_and_cabin_once() -> None:
    batch = plan_candidate_batch(
        _watch(
            DateMode.EXACT,
            origin_airports=("YVR", "SEA"),
            exact_departure_date=date(2026, 11, 12),
            exact_return_date=date(2026, 11, 16),
        ),
        as_of=date(2026, 9, 29),
    )

    assert len(batch.candidates) == 4
    assert {candidate.origin for candidate in batch.candidates} == {"YVR", "SEA"}
    assert {candidate.cabin for candidate in batch.candidates} == {
        Cabin.ECONOMY,
        Cabin.BUSINESS,
    }
    assert batch.completed_cycle is True


def test_window_batch_stops_at_a_complete_date_pair_and_resumes() -> None:
    watch = _watch(
        DateMode.FLEXIBLE_WINDOW,
        window_departure_start=date(2026, 10, 10),
        window_departure_end=date(2026, 10, 12),
        min_trip_nights=3,
        max_trip_nights=4,
    )
    first = plan_candidate_batch(
        watch,
        as_of=date(2026, 9, 29),
        candidate_limit=3,
    )
    second = plan_candidate_batch(
        watch,
        as_of=date(2026, 9, 29),
        cursor=first.next_cursor,
        candidate_limit=3,
    )

    assert len(first.candidates) == 2
    assert {candidate.return_date for candidate in first.candidates} == {
        date(2026, 10, 13)
    }
    assert first.next_cursor == PlanningCursor(date(2026, 10, 10), 4)
    assert {candidate.return_date for candidate in second.candidates} == {
        date(2026, 10, 14)
    }


def test_anytime_cursor_rolls_forward_when_the_calendar_advances() -> None:
    watch = _watch(
        DateMode.ANYTIME,
        min_trip_nights=2,
        max_trip_nights=2,
        rolling_horizon_days=5,
    )
    batch = plan_candidate_batch(
        watch,
        as_of=date(2026, 10, 3),
        cursor=PlanningCursor(date(2026, 10, 1), 2, completed_cycles=7),
        candidate_limit=2,
    )

    assert {candidate.departure_date for candidate in batch.candidates} == {
        date(2026, 10, 4)
    }
    assert batch.next_cursor.completed_cycles == 7


def test_priority_follows_the_rolling_horizon_bands() -> None:
    as_of = date(2026, 9, 29)

    assert priority_for_departure(date(2026, 10, 29), as_of=as_of) == 100
    assert priority_for_departure(date(2026, 12, 28), as_of=as_of) == 60
    assert priority_for_departure(date(2027, 3, 28), as_of=as_of) == 30
    assert priority_for_departure(date(2027, 4, 1), as_of=as_of) == 10


def test_anytime_active_window_advances_with_the_calendar() -> None:
    watch = _watch(
        DateMode.ANYTIME,
        min_trip_nights=2,
        max_trip_nights=4,
        rolling_horizon_days=30,
    )

    assert active_departure_window(watch, as_of=date(2026, 9, 29)) == (
        date(2026, 9, 30),
        date(2026, 10, 29),
    )
