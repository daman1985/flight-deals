"""Deterministic cabin-spread detector behavior."""

from datetime import date, datetime, timezone

from fare_worker.detector import (
    AnomalySeverity,
    AnomalyType,
    DetectionThresholds,
    evaluate_cabin_spreads,
)
from fare_worker.models import Cabin, FareOffer

WATCH_ID = "00000000-0000-4000-8000-000000000001"


def _offer(
    cabin: Cabin,
    price: float,
    *,
    stops_outbound: int = 0,
    stops_return: int = 0,
    duration_outbound_minutes: int = 180,
    duration_return_minutes: int = 180,
) -> FareOffer:
    return FareOffer(
        provider="fixture",
        origin="YVR",
        destination="SNA",
        departure_date=date(2026, 11, 12),
        return_date=date(2026, 11, 16),
        cabin=cabin,
        total_price=price,
        currency="CAD",
        airline="Fixture Air",
        flight_numbers=[f"FX-{cabin.value}"],
        stops_outbound=stops_outbound,
        stops_return=stops_return,
        duration_outbound_minutes=duration_outbound_minutes,
        duration_return_minutes=duration_return_minutes,
        observed_at=datetime(2026, 9, 29, tzinfo=timezone.utc),
    )


def test_detects_premium_economy_inversion() -> None:
    results = evaluate_cabin_spreads(
        WATCH_ID,
        [_offer(Cabin.ECONOMY, 900), _offer(Cabin.PREMIUM_ECONOMY, 850)],
        DetectionThresholds(),
    )

    assert len(results) == 1
    assert results[0].anomaly_type is AnomalyType.CABIN_INVERSION
    assert results[0].severity is AnomalySeverity.HIGH
    assert results[0].spread_amount == -50


def test_detects_premium_economy_near_inversion_at_threshold() -> None:
    results = evaluate_cabin_spreads(
        WATCH_ID,
        [_offer(Cabin.ECONOMY, 1000), _offer(Cabin.PREMIUM_ECONOMY, 1150)],
        DetectionThresholds(pe_near_inversion_pct=15),
    )

    assert results[0].anomaly_type is AnomalyType.NEAR_INVERSION
    assert results[0].severity is AnomalySeverity.MEDIUM
    assert results[0].spread_pct == 15


def test_detects_business_inversion_and_value_spread() -> None:
    inversion = evaluate_cabin_spreads(
        WATCH_ID,
        [_offer(Cabin.PREMIUM_ECONOMY, 1200), _offer(Cabin.BUSINESS, 1100)],
        DetectionThresholds(),
    )
    value = evaluate_cabin_spreads(
        WATCH_ID,
        [_offer(Cabin.PREMIUM_ECONOMY, 1000), _offer(Cabin.BUSINESS, 1300)],
        DetectionThresholds(business_vs_pe_pct=30),
    )

    assert inversion[0].anomaly_type is AnomalyType.CABIN_INVERSION
    assert value[0].anomaly_type is AnomalyType.BUSINESS_VALUE_SPREAD


def test_returns_non_anomalous_complete_comparison_for_resolution() -> None:
    results = evaluate_cabin_spreads(
        WATCH_ID,
        [_offer(Cabin.ECONOMY, 800), _offer(Cabin.PREMIUM_ECONOMY, 1000)],
        DetectionThresholds(pe_near_inversion_pct=15),
    )

    assert len(results) == 1
    assert results[0].is_anomaly is False
    assert results[0].anomaly_type is None


def test_does_not_compare_mismatched_stop_buckets_or_missing_cabins() -> None:
    mismatched = evaluate_cabin_spreads(
        WATCH_ID,
        [
            _offer(Cabin.ECONOMY, 900, stops_outbound=0),
            _offer(Cabin.PREMIUM_ECONOMY, 950, stops_outbound=1),
        ],
        DetectionThresholds(),
    )
    missing = evaluate_cabin_spreads(
        WATCH_ID,
        [_offer(Cabin.ECONOMY, 900)],
        DetectionThresholds(),
    )

    assert mismatched == []
    assert missing == []


def test_applies_configured_duration_cap() -> None:
    results = evaluate_cabin_spreads(
        WATCH_ID,
        [
            _offer(Cabin.ECONOMY, 900),
            _offer(
                Cabin.PREMIUM_ECONOMY,
                950,
                duration_return_minutes=600,
            ),
        ],
        DetectionThresholds(max_duration_minutes=360),
    )

    assert results == []


def test_comparison_id_is_stable_for_idempotent_persistence() -> None:
    offers = [_offer(Cabin.ECONOMY, 900), _offer(Cabin.PREMIUM_ECONOMY, 950)]

    first = evaluate_cabin_spreads(WATCH_ID, offers, DetectionThresholds())[0]
    second = evaluate_cabin_spreads(WATCH_ID, list(reversed(offers)), DetectionThresholds())[0]

    assert first.anomaly_id == second.anomaly_id
