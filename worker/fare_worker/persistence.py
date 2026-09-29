"""Narrow Supabase REST persistence used by the controlled proof."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

import httpx

from .detector import CabinComparison, DetectionThresholds
from .models import Cabin, FareOffer, FareSearchRequest, FareSearchResponse, SearchStatus


class SupabaseRestStore:
    """Persist worker-owned rows with a server-only Supabase secret key."""

    def __init__(self, url: str, secret_key: str, *, timeout_seconds: float = 20) -> None:
        self._base_url = url.rstrip("/")
        headers = {
            "apikey": secret_key,
            "Content-Type": "application/json",
        }
        if not secret_key.startswith("sb_secret_"):
            # Legacy service-role keys are JWTs and still use Bearer auth. Modern
            # secret keys are opaque and must be sent only through `apikey`.
            headers["Authorization"] = f"Bearer {secret_key}"
        self._client = httpx.Client(
            base_url=f"{self._base_url}/rest/v1",
            timeout=timeout_seconds,
            headers=headers,
        )

    def close(self) -> None:
        """Close the underlying HTTP connection pool."""
        self._client.close()

    def ensure_exact_test_watch(
        self,
        *,
        watch_id: str,
        user_id: str,
        departure_date: str,
        return_date: str,
    ) -> None:
        """Upsert the dedicated YVR → SNA development watch."""
        payload = {
            "id": watch_id,
            "user_id": user_id,
            "name": "Milestone 1 — YVR to SNA",
            "origin_airports": ["YVR"],
            "destination_airports": ["SNA"],
            "date_mode": "EXACT",
            "exact_departure_date": departure_date,
            "exact_return_date": return_date,
            "cabins": ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS"],
            "passengers": 1,
            "max_stops": 1,
            "active": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._request(
            "POST",
            "/watches",
            params={"on_conflict": "id"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json=payload,
        )

    def upsert_candidate(self, watch_id: str, request: FareSearchRequest) -> str:
        """Create or reuse the exact search candidate for one cabin."""
        payload = {
            "watch_id": watch_id,
            "origin": request.origin,
            "destination": request.destination,
            "departure_date": request.departure_date.isoformat(),
            "return_date": request.return_date.isoformat() if request.return_date else None,
            "cabin": request.cabin.value,
            "priority": 100,
            "active": True,
        }
        rows = self._request(
            "POST",
            "/search_candidates",
            params={
                "on_conflict": (
                    "watch_id,origin,destination,departure_date,return_date,cabin"
                )
            },
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            json=payload,
        )
        return str(rows[0]["id"])

    def persist_response(
        self,
        *,
        watch_id: str,
        candidate_id: str,
        response: FareSearchResponse,
        started_at: datetime,
    ) -> str:
        """Store health for every attempt and fares only for valid responses."""
        health = response.health
        finished_at = datetime.now(timezone.utc)
        run_payload = {
            "watch_id": watch_id,
            "candidate_id": candidate_id,
            "provider": "fli",
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "status": health.status.value,
            "result_count": health.result_count,
            "completeness_score": health.completeness,
            "retry_count": health.retries,
            "error_code": health.provider_error_code,
            "error_message": health.provider_error_message,
            "latency_ms": health.latency_ms,
        }
        runs = self._request(
            "POST",
            "/search_runs",
            headers={"Prefer": "return=representation"},
            json=run_payload,
        )
        run_id = str(runs[0]["id"])

        if health.status is SearchStatus.VALID_RESULT:
            quality_eligible = health.completeness == 1
            observations = [
                {
                    "watch_id": watch_id,
                    "search_run_id": run_id,
                    "provider": offer.provider,
                    "origin": offer.origin,
                    "destination": offer.destination,
                    "departure_date": offer.departure_date.isoformat(),
                    "return_date": offer.return_date.isoformat() if offer.return_date else None,
                    "cabin": offer.cabin.value,
                    "airline": offer.airline,
                    "flight_numbers": offer.flight_numbers,
                    "stops_outbound": offer.stops_outbound,
                    "stops_return": offer.stops_return,
                    "duration_outbound_minutes": offer.duration_outbound_minutes,
                    "duration_return_minutes": offer.duration_return_minutes,
                    "total_price": offer.total_price,
                    "currency": offer.currency,
                    "booking_url": offer.booking_url,
                    "observed_at": offer.observed_at.isoformat(),
                    "confirmed": False,
                    "quality_eligible": quality_eligible,
                    "raw_payload_json": offer.raw_payload or {},
                }
                for offer in response.offers
            ]
            self._request(
                "POST",
                "/fare_observations",
                headers={"Prefer": "return=minimal"},
                json=observations,
            )

        self._request(
            "PATCH",
            "/search_candidates",
            params={"id": f"eq.{candidate_id}"},
            headers={"Prefer": "return=minimal"},
            json={
                "last_scanned_at": finished_at.isoformat(),
                "scan_count": _increment_scan_count_unavailable_marker(),
            },
            allow_scan_count_marker=True,
        )
        return run_id

    def load_detection_input(
        self,
        watch_id: str,
    ) -> tuple[DetectionThresholds, list[FareOffer]]:
        """Load watch thresholds and the latest complete batch for each cabin."""
        watches = self._request(
            "GET",
            "/watches",
            params={
                "id": f"eq.{watch_id}",
                "select": (
                    "pe_near_inversion_pct,business_vs_pe_pct,"
                    "max_duration_minutes"
                ),
            },
        )
        if len(watches) != 1:
            raise RuntimeError("Expected exactly one watch for detection")

        watch = watches[0]
        thresholds = DetectionThresholds(
            pe_near_inversion_pct=float(watch["pe_near_inversion_pct"]),
            business_vs_pe_pct=float(watch["business_vs_pe_pct"]),
            max_duration_minutes=watch["max_duration_minutes"],
        )
        runs = self._request(
            "GET",
            "/search_runs",
            params={
                "watch_id": f"eq.{watch_id}",
                "select": "id,candidate_id,status,finished_at",
                "order": "finished_at.desc",
            },
        )
        latest_by_candidate: dict[str, dict[str, Any]] = {}
        for run in runs:
            latest_by_candidate.setdefault(run["candidate_id"], run)
        valid_run_ids = [
            run["id"]
            for run in latest_by_candidate.values()
            if run["status"] == SearchStatus.VALID_RESULT.value
        ]
        if not valid_run_ids:
            return thresholds, []

        rows = self._request(
            "GET",
            "/fare_observations",
            params={
                "watch_id": f"eq.{watch_id}",
                "search_run_id": f"in.({','.join(valid_run_ids)})",
                "quality_eligible": "is.true",
                "select": (
                    "provider,origin,destination,departure_date,return_date,cabin,"
                    "airline,flight_numbers,stops_outbound,stops_return,"
                    "duration_outbound_minutes,duration_return_minutes,total_price,"
                    "currency,booking_url,observed_at"
                ),
                "order": "observed_at.desc",
            },
        )
        return thresholds, _offers_from_rows(rows)

    def persist_comparison_results(
        self,
        watch_id: str,
        comparisons: list[CabinComparison],
    ) -> tuple[int, int]:
        """Upsert detected anomalies and resolve only complete non-anomalous pairs."""
        anomalies = [comparison for comparison in comparisons if comparison.is_anomaly]
        persisted = 0
        if anomalies:
            payload = [
                {
                    "id": comparison.anomaly_id,
                    "watch_id": watch_id,
                    "type": comparison.anomaly_type.value,
                    "severity": comparison.severity.value,
                    "origin": comparison.lower_offer.origin,
                    "destination": comparison.lower_offer.destination,
                    "departure_date": comparison.lower_offer.departure_date.isoformat(),
                    "return_date": (
                        comparison.lower_offer.return_date.isoformat()
                        if comparison.lower_offer.return_date
                        else None
                    ),
                    "lower_cabin": comparison.lower_offer.cabin.value,
                    "higher_cabin": comparison.higher_offer.cabin.value,
                    "lower_cabin_price": comparison.lower_offer.total_price,
                    "higher_cabin_price": comparison.higher_offer.total_price,
                    "spread_amount": comparison.spread_amount,
                    "spread_pct": comparison.spread_pct,
                    "confidence": "OBSERVED",
                    "confirmed_at": None,
                    "resolved_at": None,
                    "explanation_json": comparison.explanation(),
                }
                for comparison in anomalies
            ]
            rows = self._request(
                "POST",
                "/anomalies",
                params={"on_conflict": "id"},
                headers={"Prefer": "resolution=merge-duplicates,return=representation"},
                json=payload,
            )
            persisted = len(rows)

        resolved = 0
        resolved_at = datetime.now(timezone.utc).isoformat()
        for comparison in comparisons:
            if comparison.is_anomaly:
                continue
            rows = self._request(
                "PATCH",
                "/anomalies",
                params={
                    "id": f"eq.{comparison.anomaly_id}",
                    "resolved_at": "is.null",
                },
                headers={"Prefer": "return=representation"},
                json={"resolved_at": resolved_at},
            )
            resolved += len(rows)

        return persisted, resolved

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        json: Any = None,
        allow_scan_count_marker: bool = False,
    ) -> Any:
        if allow_scan_count_marker and isinstance(json, dict):
            # PostgREST cannot atomically increment with a JSON PATCH. Fetch the
            # current count first; this controlled proof has exactly one writer.
            current = self._request(
                "GET",
                path,
                params={"id": params["id"], "select": "scan_count"},
            )
            json = {**json, "scan_count": int(current[0]["scan_count"]) + 1}
        response = self._client.request(
            method,
            path.lstrip("/"),
            params=params,
            headers=headers,
            json=json,
        )
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()


def _increment_scan_count_unavailable_marker() -> int:
    """Return a placeholder replaced by `_request` after reading current state."""
    return 0


def _offers_from_rows(rows: list[dict[str, Any]]) -> list[FareOffer]:
    """Convert quality-eligible rows from explicitly selected latest runs."""
    return [
        FareOffer(
            provider=row["provider"],
            origin=row["origin"],
            destination=row["destination"],
            departure_date=date.fromisoformat(row["departure_date"]),
            return_date=(
                date.fromisoformat(row["return_date"])
                if row["return_date"]
                else None
            ),
            cabin=Cabin(row["cabin"]),
            total_price=float(row["total_price"]),
            currency=row["currency"],
            airline=row["airline"],
            flight_numbers=row["flight_numbers"],
            stops_outbound=row["stops_outbound"],
            stops_return=row["stops_return"],
            duration_outbound_minutes=row["duration_outbound_minutes"],
            duration_return_minutes=row["duration_return_minutes"],
            booking_url=row["booking_url"],
            observed_at=datetime.fromisoformat(row["observed_at"]),
            raw_payload=None,
        )
        for row in rows
    ]
