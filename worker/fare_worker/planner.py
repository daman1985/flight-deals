"""Deterministic, bounded candidate planning for Exact, Window, and Anytime watches."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum

from .models import Cabin


class DateMode(str, Enum):
    """Date scopes supported by a saved watch."""

    EXACT = "EXACT"
    FLEXIBLE_WINDOW = "FLEXIBLE_WINDOW"
    ANYTIME = "ANYTIME"


@dataclass(frozen=True)
class WatchPlan:
    """The subset of a watch definition needed to generate candidates."""

    id: str
    origin_airports: tuple[str, ...]
    destination_airports: tuple[str, ...]
    date_mode: DateMode
    cabins: tuple[Cabin, ...]
    exact_departure_date: date | None = None
    exact_return_date: date | None = None
    window_departure_start: date | None = None
    window_departure_end: date | None = None
    min_trip_nights: int | None = None
    max_trip_nights: int | None = None
    rolling_horizon_days: int | None = None


@dataclass(frozen=True)
class PlanningCursor:
    """The next date pair to expand for a watch."""

    departure_date: date
    trip_nights: int
    completed_cycles: int = 0


@dataclass(frozen=True)
class PlannedCandidate:
    """One provider-neutral route, date, and cabin search candidate."""

    origin: str
    destination: str
    departure_date: date
    return_date: date
    cabin: Cabin
    priority: int


@dataclass(frozen=True)
class PlanningBatch:
    """A bounded candidate batch plus its persisted continuation cursor."""

    candidates: tuple[PlannedCandidate, ...]
    next_cursor: PlanningCursor
    completed_cycle: bool


def plan_candidate_batch(
    watch: WatchPlan,
    *,
    as_of: date,
    cursor: PlanningCursor | None = None,
    candidate_limit: int = 60,
) -> PlanningBatch:
    """Expand complete date pairs without splitting their route/cabin combinations."""
    if candidate_limit < 1:
        raise ValueError("candidate_limit must be positive")

    first_departure, last_departure, minimum_nights, maximum_nights = _scope(
        watch,
        as_of,
    )
    combinations_per_pair = (
        len(watch.origin_airports)
        * len(watch.destination_airports)
        * len(watch.cabins)
    )
    if combinations_per_pair == 0:
        raise ValueError("watch must include origins, destinations, and cabins")

    current = _normalize_cursor(
        cursor,
        first_departure=first_departure,
        last_departure=last_departure,
        minimum_nights=minimum_nights,
        maximum_nights=maximum_nights,
    )
    planned: list[PlannedCandidate] = []
    completed_cycle = False

    while True:
        if planned and len(planned) + combinations_per_pair > candidate_limit:
            break

        return_date = current.departure_date + timedelta(days=current.trip_nights)
        priority = priority_for_departure(current.departure_date, as_of=as_of)
        planned.extend(
            PlannedCandidate(
                origin=origin,
                destination=destination,
                departure_date=current.departure_date,
                return_date=return_date,
                cabin=cabin,
                priority=priority,
            )
            for origin in watch.origin_airports
            for destination in watch.destination_airports
            for cabin in watch.cabins
        )

        next_departure = current.departure_date
        next_nights = current.trip_nights + 1
        if next_nights > maximum_nights:
            next_departure += timedelta(days=1)
            next_nights = minimum_nights

        if next_departure > last_departure:
            completed_cycle = True
            current = PlanningCursor(
                departure_date=first_departure,
                trip_nights=minimum_nights,
                completed_cycles=current.completed_cycles + 1,
            )
            break

        current = PlanningCursor(
            departure_date=next_departure,
            trip_nights=next_nights,
            completed_cycles=current.completed_cycles,
        )

    return PlanningBatch(
        candidates=tuple(planned),
        next_cursor=current,
        completed_cycle=completed_cycle,
    )


def priority_for_departure(departure_date: date, *, as_of: date) -> int:
    """Map time-to-travel to the first rolling-horizon priority bands."""
    days_until = (departure_date - as_of).days
    if days_until <= 30:
        return 100
    if days_until <= 90:
        return 60
    if days_until <= 180:
        return 30
    return 10


def active_departure_window(watch: WatchPlan, *, as_of: date) -> tuple[date, date]:
    """Return the active departure bounds used to expire stale candidates."""
    first_departure, last_departure, _, _ = _scope(watch, as_of)
    return first_departure, last_departure


def _scope(watch: WatchPlan, as_of: date) -> tuple[date, date, int, int]:
    if watch.date_mode is DateMode.EXACT:
        if watch.exact_departure_date is None or watch.exact_return_date is None:
            raise ValueError("exact watches require departure and return dates")
        nights = (watch.exact_return_date - watch.exact_departure_date).days
        if nights < 1:
            raise ValueError("return date must be after departure date")
        return (
            watch.exact_departure_date,
            watch.exact_departure_date,
            nights,
            nights,
        )

    minimum_nights = watch.min_trip_nights
    maximum_nights = watch.max_trip_nights
    if minimum_nights is None or maximum_nights is None:
        raise ValueError("window and anytime watches require trip lengths")
    if minimum_nights < 1 or maximum_nights < minimum_nights:
        raise ValueError("trip-length range is invalid")

    tomorrow = as_of + timedelta(days=1)
    if watch.date_mode is DateMode.FLEXIBLE_WINDOW:
        if watch.window_departure_start is None or watch.window_departure_end is None:
            raise ValueError("window watches require a departure range")
        first_departure = max(watch.window_departure_start, tomorrow)
        last_departure = watch.window_departure_end
    else:
        if watch.rolling_horizon_days is None:
            raise ValueError("anytime watches require a rolling horizon")
        first_departure = tomorrow
        last_departure = as_of + timedelta(days=watch.rolling_horizon_days)

    if first_departure > last_departure:
        raise ValueError("watch has no future departure dates to plan")
    return first_departure, last_departure, minimum_nights, maximum_nights


def _normalize_cursor(
    cursor: PlanningCursor | None,
    *,
    first_departure: date,
    last_departure: date,
    minimum_nights: int,
    maximum_nights: int,
) -> PlanningCursor:
    if (
        cursor is None
        or cursor.departure_date < first_departure
        or cursor.departure_date > last_departure
        or cursor.trip_nights < minimum_nights
        or cursor.trip_nights > maximum_nights
    ):
        return PlanningCursor(
            first_departure,
            minimum_nights,
            completed_cycles=cursor.completed_cycles if cursor is not None else 0,
        )
    return cursor
