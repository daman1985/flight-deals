import { describe, expect, it } from "vitest";

import { toWatchInsert, watchDraftSchema } from "@/domain/watch";

const userId = "00000000-0000-4000-8000-000000000001";

function baseDraft() {
  return {
    name: "West Coast winter escape",
    originAirports: "yvr, yyj",
    destinationAirports: "SNA LAX",
    cabins: ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS"],
    passengers: "1",
    maxStops: "1",
    maxDurationHours: "12",
    peNearInversionPct: "15",
    businessVsPePct: "30",
  };
}

describe("watchDraftSchema", () => {
  it("builds an Exact watch and clears fields from other date modes", () => {
    const watch = watchDraftSchema.parse({
      ...baseDraft(),
      dateMode: "EXACT",
      exactDepartureDate: "2026-11-12",
      exactReturnDate: "2026-11-16",
    });

    expect(toWatchInsert(watch, userId)).toMatchObject({
      user_id: userId,
      origin_airports: ["YVR", "YYJ"],
      destination_airports: ["SNA", "LAX"],
      date_mode: "EXACT",
      exact_departure_date: "2026-11-12",
      exact_return_date: "2026-11-16",
      window_departure_start: null,
      min_trip_nights: null,
      rolling_horizon_days: null,
      max_duration_minutes: 720,
    });
  });

  it("builds a Flexible Window watch with an ordered stay range", () => {
    const watch = watchDraftSchema.parse({
      ...baseDraft(),
      dateMode: "FLEXIBLE_WINDOW",
      windowDepartureStart: "2027-03-01",
      windowDepartureEnd: "2027-03-31",
      minTripNights: "5",
      maxTripNights: "12",
    });

    expect(toWatchInsert(watch, userId)).toMatchObject({
      date_mode: "FLEXIBLE_WINDOW",
      exact_departure_date: null,
      window_departure_start: "2027-03-01",
      window_departure_end: "2027-03-31",
      min_trip_nights: 5,
      max_trip_nights: 12,
      rolling_horizon_days: null,
    });
  });

  it("builds an Anytime watch as a first-class rolling horizon", () => {
    const watch = watchDraftSchema.parse({
      ...baseDraft(),
      dateMode: "ANYTIME",
      rollingHorizonDays: "300",
      minTripNights: "3",
      maxTripNights: "14",
    });

    expect(toWatchInsert(watch, userId)).toMatchObject({
      date_mode: "ANYTIME",
      exact_departure_date: null,
      window_departure_start: null,
      rolling_horizon_days: 300,
      min_trip_nights: 3,
      max_trip_nights: 14,
    });
  });

  it("rejects overlapping airports and inverted date or stay ranges", () => {
    const result = watchDraftSchema.safeParse({
      ...baseDraft(),
      originAirports: "YVR",
      destinationAirports: "YVR",
      dateMode: "FLEXIBLE_WINDOW",
      windowDepartureStart: "2027-04-30",
      windowDepartureEnd: "2027-04-01",
      minTripNights: "14",
      maxTripNights: "3",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Origin and destination airport sets cannot overlap.",
          "The window end cannot be before its start.",
          "Maximum nights cannot be less than minimum nights.",
        ]),
      );
    }
  });
});
