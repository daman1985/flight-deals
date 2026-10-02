import { describe, expect, it } from "vitest";

import { historicalContextFromJson, historicalReadiness } from "@/domain/history";

function metric(sampleCount: number, gate: string) {
  return {
    sample_count: sampleCount,
    gate,
    median: gate === "BUILDING" ? null : 12.5,
    mad: gate === "BUILDING" ? null : 2.5,
    percentile: gate === "BUILDING" ? null : 6.667,
    robust_score: gate === "ELIGIBLE" ? -2.4 : null,
    first_sample_at: "2026-09-01T00:00:00Z",
    last_sample_at: "2026-09-30T00:00:00Z",
    classification_eligible: gate === "ELIGIBLE",
    historical_low: gate === "ELIGIBLE",
  };
}

function fixture(gate = "ELIGIBLE", sampleCount = 30) {
  return {
    method: "fare-radar-history-v1",
    scope: {
      currency: "CAD",
      passengers: 1,
      outbound_stop_bucket: "ONE_STOP",
      return_stop_bucket: "ONE_STOP",
      lower_cabin: "PREMIUM_ECONOMY",
      higher_cabin: "BUSINESS",
    },
    lower_price: metric(sampleCount, gate),
    higher_price: metric(sampleCount, gate),
    spread_pct: metric(sampleCount, gate),
  };
}

describe("historicalContextFromJson", () => {
  it("parses a versioned, exact-scope historical snapshot", () => {
    const context = historicalContextFromJson(fixture());

    expect(context).toMatchObject({
      method: "fare-radar-history-v1",
      spreadPct: {
        sampleCount: 30,
        gate: "ELIGIBLE",
        percentile: 6.667,
        historicalLow: true,
      },
      scope: {
        currency: "CAD",
        passengers: 1,
        outboundStopBucket: "ONE_STOP",
        returnStopBucket: "ONE_STOP",
      },
    });
  });

  it("rejects unknown methods and incomplete scopes", () => {
    expect(historicalContextFromJson({ ...fixture(), method: "future-v2" })).toBeNull();
    expect(historicalContextFromJson({ ...fixture(), scope: {} })).toBeNull();
  });

  it("keeps readiness language honest at each evidence gate", () => {
    const building = historicalContextFromJson(fixture("BUILDING", 9));
    const limited = historicalContextFromJson(fixture("LIMITED", 10));
    const eligible = historicalContextFromJson(fixture("ELIGIBLE", 30));

    expect(historicalReadiness(building!.spreadPct)).toBe(
      "9 of 10 comparable cycles collected",
    );
    expect(historicalReadiness(limited!.spreadPct)).toContain("context only");
    expect(historicalReadiness(eligible!.spreadPct)).toContain(
      "historical comparison eligible",
    );
  });
});
