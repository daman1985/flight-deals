"""Offline reconfirmation checks: exact scope, independent attempts and no false alerts."""

from datetime import date, datetime, timezone
from unittest.mock import Mock

import pytest

from fare_worker.detector import DetectionThresholds, evaluate_cabin_spreads
from fare_worker.models import Cabin, FareOffer, FareSearchRequest, FareSearchResponse, SearchHealth, SearchStatus
from fare_worker.reconfirmation import is_reconfirmation_eligible, run_reconfirmation_batch, validated_response

WATCH_ID = "00000000-0000-4000-8000-000000000001"


def response(cabin=Cabin.ECONOMY, price=1000, **offer_changes):
    request = FareSearchRequest(origin="YVR", destination="SNA", departure_date=date(2099, 1, 1),
        return_date=date(2099, 1, 8), cabin=cabin, passengers=2, max_stops=1)
    values = dict(provider="fixture", origin=request.origin, destination=request.destination,
        departure_date=request.departure_date, return_date=request.return_date, cabin=cabin,
        total_price=price, currency="CAD", observed_at=datetime.now(timezone.utc),
        stops_outbound=1, stops_return=1, duration_outbound_minutes=300, duration_return_minutes=300)
    values.update(offer_changes)
    return FareSearchResponse(request=request, offers=[FareOffer(**values)],
        health=SearchHealth(status=SearchStatus.VALID_RESULT, result_count=1, completeness=1, latency_ms=1))


def job():
    lo, hi = response(), response(Cabin.PREMIUM_ECONOMY, 1100)
    comparison = evaluate_cabin_spreads(WATCH_ID, lo.offers + hi.offers, DetectionThresholds())[0]
    return {"anomaly_id": comparison.anomaly_id, "anomaly_snapshot": {
        "watch_id": WATCH_ID, "origin": "YVR", "destination": "SNA",
        "departure_date": "2099-01-01", "return_date": "2099-01-08",
        "lower_cabin": "ECONOMY", "higher_cabin": "PREMIUM_ECONOMY",
        "type": comparison.anomaly_type.value, "explanation_json": comparison.explanation(),
    }, "watch_snapshot": {"passengers": 2, "max_stops": 1, "max_duration_minutes": 400,
        "pe_near_inversion_pct": 15, "business_vs_pe_pct": 30}}


def test_complete_comparable_research_can_confirm():
    assert is_reconfirmation_eligible(job(), [response(), response(Cabin.PREMIUM_ECONOMY, 1100)])


@pytest.mark.parametrize("status", [SearchStatus.NO_RESULT, SearchStatus.INCOMPLETE_RESULT,
    SearchStatus.PROVIDER_FAILURE, SearchStatus.THROTTLED])
def test_missing_or_unhealthy_evidence_never_confirms(status):
    hi = response(Cabin.PREMIUM_ECONOMY, 1100)
    unhealthy = FareSearchResponse(request=hi.request, offers=[], health=SearchHealth(
        status=status, result_count=0, completeness=0, latency_ms=1))
    assert not is_reconfirmation_eligible(job(), [response(), unhealthy])


@pytest.mark.parametrize("changes", [
    {"currency": "USD"}, {"departure_date": date(2099, 1, 2)}, {"origin": "SEA"},
    {"stops_outbound": 0}, {"stops_return": 0}, {"stops_outbound": 2},
    {"duration_return_minutes": 401}, {"duration_outbound_minutes": None},
    {"total_price": 1500}, {"cabin": Cabin.BUSINESS},
])
def test_wrong_scope_or_quality_or_rule_never_confirms(changes):
    hi = response(Cabin.PREMIUM_ECONOMY, 1100).model_copy(update={
        "offers": [response(Cabin.PREMIUM_ECONOMY, 1100).offers[0].model_copy(update=changes)]})
    assert not is_reconfirmation_eligible(job(), [response(), hi])


def test_partial_valid_result_and_only_one_cabin_do_not_confirm():
    hi = response(Cabin.PREMIUM_ECONOMY, 1100)
    hi.health.completeness = 0.9
    assert not is_reconfirmation_eligible(job(), [response(), hi])
    assert not is_reconfirmation_eligible(job(), [response()])


def test_changed_rule_does_not_confirm_original_signal():
    # A near-inversion job must not confirm itself as a different anomaly class.
    assert not is_reconfirmation_eligible(job(), [response(), response(Cabin.PREMIUM_ECONOMY, 900)])


@pytest.mark.parametrize("lower_cabin,higher_cabin,higher_price", [
    (Cabin.ECONOMY, Cabin.PREMIUM_ECONOMY, 900),
    (Cabin.PREMIUM_ECONOMY, Cabin.BUSINESS, 1250),
])
def test_inversion_and_business_value_use_the_existing_detector(lower_cabin, higher_cabin, higher_price):
    lo, hi = response(lower_cabin), response(higher_cabin, higher_price)
    comparison = evaluate_cabin_spreads(WATCH_ID, lo.offers + hi.offers, DetectionThresholds())[0]
    queued = job()
    queued["anomaly_id"] = comparison.anomaly_id
    queued["anomaly_snapshot"].update(type=comparison.anomaly_type.value,
        lower_cabin=lower_cabin.value, higher_cabin=higher_cabin.value,
        explanation_json=comparison.explanation())
    assert is_reconfirmation_eligible(queued, [lo, hi])


def test_provider_scope_validation_rejects_mislabeled_response():
    wanted = response().request
    bad = response(Cabin.PREMIUM_ECONOMY)
    assert validated_response(wanted, bad).health.status is SearchStatus.PROVIDER_FAILURE
    bad = response().model_copy(update={"offers": [response().offers[0].model_copy(update={"currency": "USD"})]})
    assert validated_response(wanted, bad).offers == []


def fake_store():
    store = Mock()
    store.claim_reconfirmations.return_value = [job()]
    store.confirmation_candidate_id.side_effect = ["candidate-lo", "candidate-hi"]
    store.persist_response.side_effect = ["run-lo", "run-hi"]
    store.finish_reconfirmation.return_value = "CONFIRMED"
    return store


def test_worker_researches_original_constraints_and_persists_owned_evidence():
    store = fake_store()
    provider = Mock()
    provider.search.side_effect = [response(), response(Cabin.PREMIUM_ECONOMY, 1100)]
    assert run_reconfirmation_batch(store, provider) == (1, 1)
    requests = [call.args[0] for call in provider.search.call_args_list]
    assert [r.cabin for r in requests] == [Cabin.ECONOMY, Cabin.PREMIUM_ECONOMY]
    assert all(r.passengers == 2 and r.max_stops == 1 and r.currency == "CAD" for r in requests)
    assert all(r.departure_date == date(2099, 1, 1) and r.return_date == date(2099, 1, 8) for r in requests)
    token = store.claim_reconfirmations.call_args.kwargs["lease_token"]
    assert all(call.kwargs["reconfirmation_lease_token"] == token
        and not call.kwargs["update_candidate"] for call in store.persist_response.call_args_list)
    assert store.finish_reconfirmation.call_args.kwargs["lower_run_id"] == "run-lo"
    assert store.finish_reconfirmation.call_args.kwargs["higher_run_id"] == "run-hi"


def test_provider_exception_is_recorded_and_retried_without_alert_evidence():
    store = fake_store()
    store.finish_reconfirmation.return_value = "RETRY"
    provider = Mock()
    provider.search.side_effect = [RuntimeError("secret must not be logged"), response(Cabin.PREMIUM_ECONOMY, 1100)]
    assert run_reconfirmation_batch(store, provider) == (1, 0)
    failure = store.persist_response.call_args_list[0].kwargs["response"]
    assert failure.health.status is SearchStatus.PROVIDER_FAILURE
    assert failure.health.provider_error_code == "RuntimeError"
    assert failure.health.provider_error_message is None
    assert store.finish_reconfirmation.call_args.kwargs["lower_run_id"] is None


def test_persistence_failure_leaves_retryable_job_without_partial_confirmation():
    store = fake_store()
    store.persist_response.side_effect = ["run-lo", RuntimeError("write failed")]
    store.finish_reconfirmation.return_value = "RETRY"
    provider = Mock()
    provider.search.side_effect = [response(), response(Cabin.PREMIUM_ECONOMY, 1100)]
    assert run_reconfirmation_batch(store, provider) == (1, 0)
    assert store.finish_reconfirmation.call_args.kwargs["higher_run_id"] is None


def test_no_due_job_makes_no_provider_request():
    store, provider = fake_store(), Mock()
    store.claim_reconfirmations.return_value = []
    assert run_reconfirmation_batch(store, provider) == (0, 0)
    provider.search.assert_not_called()
