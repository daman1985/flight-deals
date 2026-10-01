import { describe, expect, it } from "vitest";

import { confirmedAnomalyView } from "@/lib/supabase/confirmed-alerts";

function baseAnomaly(
  explanation_json: Parameters<typeof confirmedAnomalyView>[0]["explanation_json"] = {},
): Parameters<typeof confirmedAnomalyView>[0] {
  return {
    id: "anomaly-1",
    watch_id: "watch-1",
    origin: "YVR",
    destination: "LHR",
    departure_date: "2027-03-01",
    return_date: "2027-03-15",
    lower_cabin: "ECONOMY",
    higher_cabin: "BUSINESS",
    lower_cabin_price: 900,
    higher_cabin_price: 940,
    spread_amount: 40,
    spread_pct: 4.4,
    confidence: "RECONFIRMED",
    confirmed_at: "2026-09-30T16:00:00Z",
    explanation_json,
    type: "NEAR_INVERSION",
    severity: "HIGH",
  };
}

describe("confirmedAnomalyView", () => {
  it("prefers the immutable confirmation snapshot, including scope and evidence", () => {
    const result = confirmedAnomalyView(baseAnomaly({
      confirmation: {
        origin: "SEA",
        destination: "NRT",
        departure_date: "2027-05-02",
        return_date: "2027-05-16",
        lower_cabin: "PREMIUM_ECONOMY",
        higher_cabin: "BUSINESS",
        lower_cabin_price: 1200,
        higher_cabin_price: 1250,
        spread_amount: 50,
        spread_pct: 4.1667,
        currency: "USD",
        type: "BUSINESS_VALUE_SPREAD",
        severity: "CRITICAL",
        confirmed_at: "2026-10-01T09:30:00Z",
        outbound_stop_bucket: "ONE_STOP",
        return_stop_bucket: "TWO_PLUS_STOPS",
        lower_observation_id: "obs-low",
        higher_observation_id: "obs-high",
        lower_run_id: "run-low",
        higher_run_id: "run-high",
      },
    }));

    expect(result).toMatchObject({
      origin: "SEA",
      destination: "NRT",
      departure_date: "2027-05-02",
      return_date: "2027-05-16",
      lower_cabin: "PREMIUM_ECONOMY",
      lower_cabin_price: 1200,
      higher_cabin_price: 1250,
      spread_pct: 4.1667,
      currency: "USD",
      type: "BUSINESS_VALUE_SPREAD",
      severity: "CRITICAL",
      confirmed_at: "2026-10-01T09:30:00Z",
      outbound_stop_bucket: "ONE_STOP",
      return_stop_bucket: "TWO_PLUS_STOPS",
      lower_observation_id: "obs-low",
      higher_observation_id: "obs-high",
      lower_run_id: "run-low",
      higher_run_id: "run-high",
    });
  });

  it("falls back to the anomaly row for legacy confirmed records", () => {
    const result = confirmedAnomalyView(baseAnomaly());

    expect(result).toMatchObject({
      origin: "YVR",
      destination: "LHR",
      departure_date: "2027-03-01",
      return_date: "2027-03-15",
      lower_cabin: "ECONOMY",
      lower_cabin_price: 900,
      higher_cabin_price: 940,
      spread_amount: 40,
      spread_pct: 4.4,
      currency: "CAD",
      type: "NEAR_INVERSION",
      severity: "HIGH",
      confirmed_at: "2026-09-30T16:00:00Z",
      outbound_stop_bucket: null,
      lower_observation_id: null,
    });
  });

  it("reads the historical evidence frozen inside the confirmation snapshot", () => {
    const buildingMetric = {
      sample_count: 4,
      gate: "BUILDING",
      median: null,
      mad: null,
      percentile: null,
      robust_score: null,
      first_sample_at: null,
      last_sample_at: null,
      classification_eligible: false,
      historical_low: false,
    };
    const result = confirmedAnomalyView(baseAnomaly({
      confirmation: {
        confirmed_at: "2026-10-01T09:30:00Z",
        historical_context: {
          method: "fare-radar-history-v1",
          scope: {
            currency: "CAD",
            passengers: 1,
            outbound_stop_bucket: "ONE_STOP",
            return_stop_bucket: "ONE_STOP",
            lower_cabin: "ECONOMY",
            higher_cabin: "BUSINESS",
          },
          lower_price: buildingMetric,
          higher_price: buildingMetric,
          spread_pct: buildingMetric,
        },
      },
    }));

    expect(result?.historical_context).toMatchObject({
      method: "fare-radar-history-v1",
      spreadPct: { sampleCount: 4, gate: "BUILDING" },
    });
  });
});
