"""Analyze the latest complete observations for one controlled watch."""

from __future__ import annotations

import os
from dataclasses import replace

from .detector import evaluate_cabin_spreads
from .persistence import SupabaseRestStore


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def analyze_watch(store: SupabaseRestStore, watch_id: str) -> tuple[int, int, int]:
    """Evaluate and persist the current comparable cabin relationships."""
    thresholds, offers = store.load_detection_input(watch_id)
    comparisons = evaluate_cabin_spreads(watch_id, offers, thresholds)
    comparisons = [
        replace(
            comparison,
            historical_context=store.load_historical_comparison_context(
                watch_id,
                comparison,
            ),
        )
        if (
            comparison.lower_offer.observation_id is not None
            and comparison.higher_offer.observation_id is not None
            and comparison.lower_offer.acquisition_batch_id is not None
            and comparison.lower_offer.acquisition_batch_id
            == comparison.higher_offer.acquisition_batch_id
        )
        else comparison
        for comparison in comparisons
    ]
    detected, resolved = store.persist_comparison_results(watch_id, comparisons)
    return len(comparisons), detected, resolved


def main() -> None:
    """Run detection without making any provider requests."""
    store = SupabaseRestStore(
        _required_env("NEXT_PUBLIC_SUPABASE_URL"),
        _required_env("SUPABASE_SECRET_KEY"),
    )
    try:
        comparisons, detected, resolved = analyze_watch(
            store,
            _required_env("TEST_WATCH_ID"),
        )
        print(
            f"comparisons={comparisons}; detected={detected}; resolved={resolved}"
        )
    finally:
        store.close()


if __name__ == "__main__":
    main()
