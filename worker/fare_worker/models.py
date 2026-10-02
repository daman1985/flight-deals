"""Provider-neutral request, offer, and health models."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, PositiveInt, field_validator, model_validator


class Cabin(str, Enum):
    """Cabin classes understood by the domain."""

    ECONOMY = "ECONOMY"
    PREMIUM_ECONOMY = "PREMIUM_ECONOMY"
    BUSINESS = "BUSINESS"
    FIRST = "FIRST"


class SearchStatus(str, Enum):
    """Health outcome for one provider request."""

    VALID_RESULT = "VALID_RESULT"
    NO_RESULT = "NO_RESULT"
    INCOMPLETE_RESULT = "INCOMPLETE_RESULT"
    PROVIDER_FAILURE = "PROVIDER_FAILURE"
    THROTTLED = "THROTTLED"


class FareSearchRequest(BaseModel):
    """Normalized fare-search input independent of any provider."""

    model_config = ConfigDict(extra="forbid")

    origin: str
    destination: str
    departure_date: date
    return_date: date | None = None
    cabin: Cabin
    passengers: PositiveInt = 1
    max_stops: int | None = Field(default=None, ge=0, le=2)
    currency: str = "CAD"

    @field_validator("origin", "destination")
    @classmethod
    def normalize_airport(cls, value: str) -> str:
        """Normalize and validate an IATA airport code."""
        normalized = value.strip().upper()
        if len(normalized) != 3 or not normalized.isalpha():
            raise ValueError("airport must be a three-letter IATA code")
        return normalized

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        """Normalize and validate an ISO-like currency code."""
        normalized = value.strip().upper()
        if len(normalized) != 3 or not normalized.isalpha():
            raise ValueError("currency must be a three-letter code")
        return normalized

    @model_validator(mode="after")
    def validate_route_and_dates(self) -> "FareSearchRequest":
        """Reject circular routes and non-forward round trips."""
        if self.origin == self.destination:
            raise ValueError("origin and destination must differ")
        if self.return_date is not None and self.return_date <= self.departure_date:
            raise ValueError("return_date must be after departure_date")
        return self


class FareOffer(BaseModel):
    """One complete normalized fare offer."""

    model_config = ConfigDict(extra="forbid")

    provider: str
    origin: str
    destination: str
    departure_date: date
    return_date: date | None = None
    cabin: Cabin
    total_price: float = Field(gt=0)
    currency: str
    airline: str | None = None
    flight_numbers: list[str] = Field(default_factory=list)
    stops_outbound: int | None = Field(default=None, ge=0)
    stops_return: int | None = Field(default=None, ge=0)
    duration_outbound_minutes: int | None = Field(default=None, ge=0)
    duration_return_minutes: int | None = Field(default=None, ge=0)
    booking_url: str | None = None
    observed_at: datetime
    raw_payload: dict[str, Any] | list[Any] | None = None
    observation_id: str | None = None
    search_run_id: str | None = None
    acquisition_batch_id: str | None = None


class SearchHealth(BaseModel):
    """Health telemetry stored separately from offers."""

    model_config = ConfigDict(extra="forbid")

    status: SearchStatus
    result_count: int = Field(ge=0)
    completeness: float = Field(ge=0, le=1)
    retries: int = Field(default=0, ge=0)
    provider_error_code: str | None = None
    provider_error_message: str | None = None
    latency_ms: int = Field(ge=0)


class FareSearchResponse(BaseModel):
    """Normalized provider response and independent health record."""

    model_config = ConfigDict(extra="forbid")

    request: FareSearchRequest
    offers: list[FareOffer]
    health: SearchHealth

    @model_validator(mode="after")
    def enforce_health_offer_invariant(self) -> "FareSearchResponse":
        """Prevent unhealthy responses from masquerading as observations."""
        if self.health.status is SearchStatus.VALID_RESULT and not self.offers:
            raise ValueError("VALID_RESULT requires at least one offer")
        if self.health.status is not SearchStatus.VALID_RESULT and self.offers:
            raise ValueError("only VALID_RESULT may contain offers")
        if self.health.result_count != len(self.offers) and self.offers:
            raise ValueError("result_count must match persisted valid offers")
        return self
