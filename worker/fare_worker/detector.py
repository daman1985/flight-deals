"""Deterministic day-one cross-cabin anomaly detection."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum
from uuid import UUID, uuid5

from .models import Cabin, FareOffer


class AnomalyType(str, Enum):
    """Day-one anomaly classes that do not require fare history."""

    CABIN_INVERSION = "CABIN_INVERSION"
    NEAR_INVERSION = "NEAR_INVERSION"
    BUSINESS_VALUE_SPREAD = "BUSINESS_VALUE_SPREAD"


class AnomalySeverity(str, Enum):
    """Initial severity before reconfirmation is introduced."""

    HIGH = "HIGH"
    MEDIUM = "MEDIUM"


@dataclass(frozen=True)
class DetectionThresholds:
    """Watch-level thresholds and quality limits used by the detector."""

    pe_near_inversion_pct: float = 15
    business_vs_pe_pct: float = 30
    max_duration_minutes: int | None = None

    def __post_init__(self) -> None:
        if not 0 <= self.pe_near_inversion_pct <= 100:
            raise ValueError("pe_near_inversion_pct must be between 0 and 100")
        if not 0 <= self.business_vs_pe_pct <= 500:
            raise ValueError("business_vs_pe_pct must be between 0 and 500")
        if self.max_duration_minutes is not None and self.max_duration_minutes <= 0:
            raise ValueError("max_duration_minutes must be positive")


@dataclass(frozen=True)
class CabinComparison:
    """One valid comparison, whether or not it crosses an anomaly threshold."""

    anomaly_id: str
    lower_offer: FareOffer
    higher_offer: FareOffer
    spread_amount: float
    spread_pct: float
    threshold_pct: float
    outbound_stop_bucket: str
    return_stop_bucket: str
    anomaly_type: AnomalyType | None = None
    severity: AnomalySeverity | None = None
    historical_context: dict[str, object] | None = None

    @property
    def is_anomaly(self) -> bool:
        return self.anomaly_type is not None

    def explanation(self) -> dict[str, object]:
        """Return bounded evidence suitable for the anomaly explanation JSON."""
        explanation: dict[str, object] = {
            "rule": self.anomaly_type.value if self.anomaly_type else "NO_ANOMALY",
            "threshold_pct": self.threshold_pct,
            "comparison_scope": {
                "currency": self.lower_offer.currency,
                "outbound_stop_bucket": self.outbound_stop_bucket,
                "return_stop_bucket": self.return_stop_bucket,
            },
            "lower_observation": {
                "cabin": self.lower_offer.cabin.value,
                "observed_at": self.lower_offer.observed_at.isoformat(),
                "flight_numbers": self.lower_offer.flight_numbers,
            },
            "higher_observation": {
                "cabin": self.higher_offer.cabin.value,
                "observed_at": self.higher_offer.observed_at.isoformat(),
                "flight_numbers": self.higher_offer.flight_numbers,
            },
        }
        if self.historical_context is not None:
            explanation["historical_context"] = self.historical_context
        return explanation


ComparisonScope = tuple[str, str, str, str, str, str, str]


def evaluate_cabin_spreads(
    watch_id: str,
    offers: Sequence[FareOffer],
    thresholds: DetectionThresholds,
) -> list[CabinComparison]:
    """Evaluate comparable cabin pairs without using historical statistics."""
    grouped: dict[ComparisonScope, dict[Cabin, list[FareOffer]]] = defaultdict(
        lambda: defaultdict(list)
    )

    for offer in offers:
        if not _within_duration_limit(offer, thresholds.max_duration_minutes):
            continue
        outbound_bucket = _stop_bucket(offer.stops_outbound)
        return_bucket = (
            "ONE_WAY" if offer.return_date is None else _stop_bucket(offer.stops_return)
        )
        if outbound_bucket is None or return_bucket is None:
            continue

        scope: ComparisonScope = (
            offer.origin,
            offer.destination,
            offer.departure_date.isoformat(),
            offer.return_date.isoformat() if offer.return_date else "",
            offer.currency,
            outbound_bucket,
            return_bucket,
        )
        grouped[scope][offer.cabin].append(offer)

    comparisons: list[CabinComparison] = []
    pairs = (
        (
            Cabin.ECONOMY,
            Cabin.PREMIUM_ECONOMY,
            thresholds.pe_near_inversion_pct,
            AnomalyType.NEAR_INVERSION,
        ),
        (
            Cabin.PREMIUM_ECONOMY,
            Cabin.BUSINESS,
            thresholds.business_vs_pe_pct,
            AnomalyType.BUSINESS_VALUE_SPREAD,
        ),
    )

    for scope, cabins in grouped.items():
        for lower_cabin, higher_cabin, threshold_pct, threshold_type in pairs:
            if lower_cabin not in cabins or higher_cabin not in cabins:
                continue

            lower_offer = min(cabins[lower_cabin], key=_offer_rank)
            higher_offer = min(cabins[higher_cabin], key=_offer_rank)
            spread_amount = round(higher_offer.total_price - lower_offer.total_price, 2)
            spread_pct = round((spread_amount / lower_offer.total_price) * 100, 4)

            anomaly_type: AnomalyType | None = None
            severity: AnomalySeverity | None = None
            if spread_amount < 0:
                anomaly_type = AnomalyType.CABIN_INVERSION
                severity = AnomalySeverity.HIGH
            elif spread_pct <= threshold_pct:
                anomaly_type = threshold_type
                severity = AnomalySeverity.MEDIUM

            comparisons.append(
                CabinComparison(
                    anomaly_id=_comparison_id(
                        watch_id,
                        scope,
                        lower_cabin,
                        higher_cabin,
                    ),
                    lower_offer=lower_offer,
                    higher_offer=higher_offer,
                    spread_amount=spread_amount,
                    spread_pct=spread_pct,
                    threshold_pct=threshold_pct,
                    outbound_stop_bucket=scope[5],
                    return_stop_bucket=scope[6],
                    anomaly_type=anomaly_type,
                    severity=severity,
                )
            )

    return sorted(
        comparisons,
        key=lambda result: (
            result.lower_offer.departure_date,
            result.lower_offer.cabin.value,
            result.outbound_stop_bucket,
            result.return_stop_bucket,
        ),
    )


def _comparison_id(
    watch_id: str,
    scope: ComparisonScope,
    lower_cabin: Cabin,
    higher_cabin: Cabin,
) -> str:
    """Create an idempotent anomaly ID for one cabin-comparison scope."""
    name = "|".join((*scope, lower_cabin.value, higher_cabin.value))
    return str(uuid5(UUID(watch_id), name))


def _stop_bucket(stops: int | None) -> str | None:
    if stops is None:
        return None
    if stops == 0:
        return "NONSTOP"
    if stops == 1:
        return "ONE_STOP"
    return "TWO_PLUS_STOPS"


def _within_duration_limit(offer: FareOffer, limit: int | None) -> bool:
    if limit is None:
        return True
    if offer.duration_outbound_minutes is None:
        return False
    if offer.duration_outbound_minutes > limit:
        return False
    if offer.return_date is None:
        return True
    return (
        offer.duration_return_minutes is not None
        and offer.duration_return_minutes <= limit
    )


def _offer_rank(offer: FareOffer) -> tuple[float, int, tuple[str, ...]]:
    duration = (offer.duration_outbound_minutes or 0) + (
        offer.duration_return_minutes or 0
    )
    return offer.total_price, duration, tuple(offer.flight_numbers)
