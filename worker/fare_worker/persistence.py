/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
"""Narrow Supabase REST persistence used by the controlled proof."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

import httpx

from .detector import CabinComparison, DetectionThresholds
from .models import Cabin, FareOffer, FareSearchRequest, FareSearchResponse, SearchStatus
from .planner import (
    DateMode,
    PlannedCandidate,
    PlanningCursor,
    WatchPlan,
)


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

    def load_active_watches(self) -> list[dict[str, Any]]:
        """Load active definitions and runtime constraints for planning and scans."""
        return self._request(
            "GET",
            "/watches",
            params={
                "active": "is.true",
                "select": (
                    "id,origin_airports,destination_airports,date_mode,cabins,"
                    "exact_departure_date,exact_return_date,window_departure_start,"
                    "window_departure_end,min_trip_nights,max_trip_nights,"
                    "rolling_horizon_days,passengers,max_stops"
                ),
                "order": "created_at.asc",
            },
        )

    @staticmethod
    def watch_plan_from_row(row: dict[str, Any]) -> WatchPlan:
        """Convert an explicitly selected watch row into the pure planner model."""
        return WatchPlan(
            id=str(row["id"]),
            origin_airports=tuple(row["origin_airports"]),
            destination_airports=tuple(row["destination_airports"]),
            date_mode=DateMode(row["date_mode"]),
            cabins=tuple(Cabin(cabin) for cabin in row["cabins"]),
            exact_departure_date=_optional_date(row["exact_departure_date"]),
            exact_return_date=_optional_date(row["exact_return_date"]),
            window_departure_start=_optional_date(row["window_departure_start"]),
            window_departure_end=_optional_date(row["window_departure_end"]),
            min_trip_nights=row["min_trip_nights"],
            max_trip_nights=row["max_trip_nights"],
            rolling_horizon_days=row["rolling_horizon_days"],
        )

    def load_planning_cursor(self, watch_id: str) -> PlanningCursor | None:
        """Load the continuation cursor for a watch when one exists."""
        rows = self._request(
            "GET",
            "/watch_planning_state",
            params={
                "watch_id": f"eq.{watch_id}",
                "select": "next_departure_date,next_trip_nights,completed_cycles",
                "limit": "1",
            },
        )
        if not rows:
            return None
        return PlanningCursor(
            departure_date=date.fromisoformat(rows[0]["next_departure_date"]),
            trip_nights=int(rows[0]["next_trip_nights"]),
            completed_cycles=int(rows[0]["completed_cycles"]),
        )

    def persist_planning_batch(
        self,
        *,
        watch_id: str,
        candidates: tuple[PlannedCandidate, ...],
        next_cursor: PlanningCursor,
    ) -> None:
        """Idempotently save a bounded candidate batch and its next cursor."""
        if candidates:
            payload = [
                {
                    "watch_id": watch_id,
                    "origin": candidate.origin,
                    "destination": candidate.destination,
                    "departure_date": candidate.departure_date.isoformat(),
                    "return_date": candidate.return_date.isoformat(),
                    "cabin": candidate.cabin.value,
                    "priority": candidate.priority,
                    "active": True,
                }
                for candidate in candidates
            ]
            self._request(
                "POST",
                "/search_candidates",
                params={
                    "on_conflict": (
                        "watch_id,origin,destination,departure_date,return_date,cabin"
                    )
                },
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                json=payload,
            )

        now = datetime.now(timezone.utc).isoformat()
        self._request(
            "POST",
            "/watch_planning_state",
            params={"on_conflict": "watch_id"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json={
                "watch_id": watch_id,
                "next_departure_date": next_cursor.departure_date.isoformat(),
                "next_trip_nights": next_cursor.trip_nights,
                "completed_cycles": next_cursor.completed_cycles,
                "last_planned_at": now,
                "updated_at": now,
            },
        )

    def deactivate_candidates_outside_window(
        self,
        *,
        watch_id: str,
        first_departure: date,
        last_departure: date,
    ) -> int:
        """Expire candidates that have rolled outside the watch's date window."""
        affected = self._request(
            "POST",
            "/rpc/deactivate_search_candidates_outside_window",
            json={
                "p_watch_id": watch_id,
                "p_first_departure": first_departure.isoformat(),
                "p_last_departure": last_departure.isoformat(),
            },
        )
        return int(affected)

    def claim_due_candidates(
        self,
        *,
        limit: int,
        lease_token: str,
        lease_seconds: int = 900,
    ) -> list[dict[str, Any]]:
        """Atomically lease due candidates without blocking parallel workers."""
        return self._request(
            "POST",
            "/rpc/claim_due_search_candidates",
            json={
                "p_limit": limit,
                "p_lease_token": lease_token,
                "p_lease_seconds": lease_seconds,
            },
        )

    def release_candidate(self, candidate_id: str, lease_token: str) -> None:
        """Release a claim after an unexpected local failure."""
        self._request(
            "PATCH",
            "/search_candidates",
            params={
                "id": f"eq.{candidate_id}",
                "lease_token": f"eq.{lease_token}",
            },
            headers={"Prefer": "return=minimal"},
            json={"lease_token": None, "lease_expires_at": None},
        )

    def persist_response(
        self,
        *,
        watch_id: str,
        candidate_id: str,
        response: FareSearchResponse,
        started_at: datetime,
        lease_token: str | None = None,
        next_scan_at: datetime | None = None,
        update_candidate: bool = True,
        reconfirmation_anomaly_id: str | None = None,
        reconfirmation_lease_token: str | None = None,
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
        if reconfirmation_anomaly_id is not None:
            run_payload["reconfirmation_anomaly_id"] = reconfirmation_anomaly_id
            run_payload["reconfirmation_lease_token"] = reconfirmation_lease_token
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

        if not update_candidate:
            return run_id
        if lease_token is not None:
            completed = self._request(
                "POST",
                "/rpc/complete_search_candidate",
                json={
                    "p_candidate_id": candidate_id,
                    "p_lease_token": lease_token,
                    "p_next_scan_at": (
                        next_scan_at.isoformat() if next_scan_at is not None else None
                    ),
                },
            )
            if completed is not True:
                raise RuntimeError("Candidate lease expired before completion")
        else:
            self._request(
                "PATCH",
                "/search_candidates",
                params={"id": f"eq.{candidate_id}"},
                headers={"Prefer": "return=minimal"},
                json={
                    "last_scanned_at": finished_at.isoformat(),
                    "next_scan_at": (
                        next_scan_at.isoformat() if next_scan_at is not None else None
                    ),
                    "scan_count": _increment_scan_count_unavailable_marker(),
                },
                allow_scan_count_marker=True,
            )
        return run_id

    def claim_reconfirmations(self, *, limit: int, lease_token: str) -> list[dict[str, Any]]:
        """Lease durable jobs; database enforces delay, retries and idempotency."""
        return self._request("POST", "/rpc/claim_anomaly_reconfirmations", json={
            "p_limit": limit, "p_lease_token": lease_token,
        })

    def confirmation_candidate_id(self, watch_id: str, request: FareSearchRequest) -> str:
        """Find an existing candidate without changing its normal scan schedule."""
        rows = self._request("GET", "/search_candidates", params={
            "watch_id": f"eq.{watch_id}", "origin": f"eq.{request.origin}",
            "destination": f"eq.{request.destination}",
            "departure_date": f"eq.{request.departure_date.isoformat()}",
            "return_date": f"eq.{request.return_date.isoformat()}" if request.return_date else "is.null",
            "cabin": f"eq.{request.cabin.value}", "active": "is.true",
            "select": "id", "order": "id", "limit": "1",
        })
        if not rows:
            raise RuntimeError("Confirmation candidate is no longer active")
        return str(rows[0]["id"])

    def finish_reconfirmation(
        self, *, anomaly_id: str, lease_token: str,
        lower_run_id: str | None = None, higher_run_id: str | None = None,
        error_code: str | None = None,
    ) -> str:
        """Atomically verify stored evidence and publish one confirmed in-app alert."""
        return self._request("POST", "/rpc/finish_anomaly_reconfirmation", json={
            "p_anomaly_id": anomaly_id, "p_lease_token": lease_token,
            "p_lower_run_id": lower_run_id, "p_higher_run_id": higher_run_id,
            "p_error_code": error_code,
        })

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


def _optional_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


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
