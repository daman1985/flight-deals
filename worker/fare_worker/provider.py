"""Provider adapter contract."""

from typing import Protocol

from .models import FareSearchRequest, FareSearchResponse


class FareProvider(Protocol):
    """Contract implemented by every fare provider adapter."""

    name: str

    def search(self, request: FareSearchRequest) -> FareSearchResponse:
        """Perform exactly one normalized fare search."""
        ...
