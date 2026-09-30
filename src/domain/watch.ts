import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

export const DATE_MODES = ["EXACT", "FLEXIBLE_WINDOW", "ANYTIME"] as const;
export const CABINS = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"] as const;

const emptyToUndefined = (value: unknown) =>
  value === "" || value === null ? undefined : value;

const optionalIsoDate = z.preprocess(
  emptyToUndefined,
  z.iso.date("Use a valid date.").optional(),
);

const optionalInteger = (minimum: number, maximum: number, message: string) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int(message).min(minimum, message).max(maximum, message).optional(),
  );

const requiredNumber = (minimum: number, maximum: number, message: string) =>
  z.coerce.number().min(minimum, message).max(maximum, message);

const airportList = z
  .string()
  .trim()
  .min(1, "Enter at least one airport code.")
  .transform((value) =>
    Array.from(
      new Set(
        value
          .split(/[\s,]+/)
          .map((airport) => airport.trim().toUpperCase())
          .filter(Boolean),
      ),
    ),
  )
  .pipe(
    z
      .array(z.string().regex(/^[A-Z]{3}$/, "Use three-letter IATA codes."))
      .min(1, "Enter at least one airport code.")
      .max(6, "Use no more than six airports per side."),
  );

export const watchDraftSchema = z
  .object({
    name: z.string().trim().min(1, "Give this watch a name.").max(120),
    originAirports: airportList,
    destinationAirports: airportList,
    dateMode: z.enum(DATE_MODES),
    exactDepartureDate: optionalIsoDate,
    exactReturnDate: optionalIsoDate,
    windowDepartureStart: optionalIsoDate,
    windowDepartureEnd: optionalIsoDate,
    minTripNights: optionalInteger(1, 60, "Use a trip length from 1 to 60 nights."),
    maxTripNights: optionalInteger(1, 60, "Use a trip length from 1 to 60 nights."),
    rollingHorizonDays: optionalInteger(1, 365, "Use a horizon from 1 to 365 days."),
    cabins: z
      .array(z.enum(CABINS))
      .min(2, "Choose Economy and at least one premium cabin.")
      .refine((cabins) => cabins.includes("ECONOMY"), {
        message: "Economy is required as the comparison reference.",
      }),
    passengers: requiredNumber(1, 9, "Use 1 to 9 passengers.").int(
      "Passengers must be a whole number.",
    ),
    maxStops: optionalInteger(0, 2, "Choose zero, one, two, or any number of stops."),
    maxDurationHours: optionalInteger(1, 72, "Use a duration from 1 to 72 hours."),
    peNearInversionPct: requiredNumber(
      0,
      100,
      "Premium Economy sensitivity must be between 0% and 100%.",
    ),
    businessVsPePct: requiredNumber(
      0,
      500,
      "Business sensitivity must be between 0% and 500%.",
    ),
  })
  .superRefine((watch, context) => {
    const overlap = watch.originAirports.filter((airport) =>
      watch.destinationAirports.includes(airport),
    );

    if (overlap.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["destinationAirports"],
        message: "Origin and destination airport sets cannot overlap.",
      });
    }

    if (watch.dateMode === "EXACT") {
      if (!watch.exactDepartureDate) {
        context.addIssue({
          code: "custom",
          path: ["exactDepartureDate"],
          message: "Choose a departure date.",
        });
      }
      if (!watch.exactReturnDate) {
        context.addIssue({
          code: "custom",
          path: ["exactReturnDate"],
          message: "Choose a return date.",
        });
      }
      if (
        watch.exactDepartureDate &&
        watch.exactReturnDate &&
        watch.exactReturnDate <= watch.exactDepartureDate
      ) {
        context.addIssue({
          code: "custom",
          path: ["exactReturnDate"],
          message: "Return must be after departure.",
        });
      }
    }

    if (watch.dateMode === "FLEXIBLE_WINDOW") {
      if (!watch.windowDepartureStart) {
        context.addIssue({
          code: "custom",
          path: ["windowDepartureStart"],
          message: "Choose the start of the departure window.",
        });
      }
      if (!watch.windowDepartureEnd) {
        context.addIssue({
          code: "custom",
          path: ["windowDepartureEnd"],
          message: "Choose the end of the departure window.",
        });
      }
      if (
        watch.windowDepartureStart &&
        watch.windowDepartureEnd &&
        watch.windowDepartureEnd < watch.windowDepartureStart
      ) {
        context.addIssue({
          code: "custom",
          path: ["windowDepartureEnd"],
          message: "The window end cannot be before its start.",
        });
      }
    }

    if (watch.dateMode === "ANYTIME" && !watch.rollingHorizonDays) {
      context.addIssue({
        code: "custom",
        path: ["rollingHorizonDays"],
        message: "Choose a rolling horizon.",
      });
    }

    if (watch.dateMode !== "EXACT") {
      if (!watch.minTripNights) {
        context.addIssue({
          code: "custom",
          path: ["minTripNights"],
          message: "Choose a minimum trip length.",
        });
      }
      if (!watch.maxTripNights) {
        context.addIssue({
          code: "custom",
          path: ["maxTripNights"],
          message: "Choose a maximum trip length.",
        });
      }
      if (
        watch.minTripNights &&
        watch.maxTripNights &&
        watch.maxTripNights < watch.minTripNights
      ) {
        context.addIssue({
          code: "custom",
          path: ["maxTripNights"],
          message: "Maximum nights cannot be less than minimum nights.",
        });
      }
    }
  });

export type WatchDraft = z.infer<typeof watchDraftSchema>;
export type WatchInsert = Database["public"]["Tables"]["watches"]["Insert"];

export function toWatchInsert(watch: WatchDraft, userId: string): WatchInsert {
  return {
    user_id: userId,
    name: watch.name,
    origin_airports: watch.originAirports,
    destination_airports: watch.destinationAirports,
    date_mode: watch.dateMode,
    exact_departure_date: watch.dateMode === "EXACT" ? watch.exactDepartureDate : null,
    exact_return_date: watch.dateMode === "EXACT" ? watch.exactReturnDate : null,
    window_departure_start:
      watch.dateMode === "FLEXIBLE_WINDOW" ? watch.windowDepartureStart : null,
    window_departure_end:
      watch.dateMode === "FLEXIBLE_WINDOW" ? watch.windowDepartureEnd : null,
    min_trip_nights: watch.dateMode === "EXACT" ? null : watch.minTripNights,
    max_trip_nights: watch.dateMode === "EXACT" ? null : watch.maxTripNights,
    rolling_horizon_days: watch.dateMode === "ANYTIME" ? watch.rollingHorizonDays : null,
    cabins: watch.cabins,
    passengers: watch.passengers,
    max_stops: watch.maxStops ?? null,
    max_duration_minutes: watch.maxDurationHours
      ? watch.maxDurationHours * 60
      : null,
    pe_near_inversion_pct: watch.peNearInversionPct,
    business_vs_pe_pct: watch.businessVsPePct,
    active: true,
  };
}
