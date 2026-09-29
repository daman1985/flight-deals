"""Provider-neutral model invariants."""

from datetime import date

import pytest
from pydantic import ValidationError

from fare_worker.models import Cabin, FareSearchRequest


def test_request_normalizes_codes() -> None:
    request = FareSearchRequest(
        origin=" yvr ",
        destination="sna",
        departure_date=date(2026, 11, 12),
        return_date=date(2026, 11, 16),
        cabin=Cabin.ECONOMY,
        passengers=1,
        currency="cad",
    )

    assert request.origin == "YVR"
    assert request.destination == "SNA"
    assert request.currency == "CAD"


def test_request_rejects_non_forward_round_trip() -> None:
    with pytest.raises(ValidationError):
        FareSearchRequest(
            origin="YVR",
            destination="SNA",
            departure_date=date(2026, 11, 12),
            return_date=date(2026, 11, 12),
            cabin=Cabin.ECONOMY,
            passengers=1,
        )
