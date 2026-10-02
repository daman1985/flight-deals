"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { toWatchInsert, watchDraftSchema } from "@/domain/watch";
import { createClient } from "@/lib/supabase/server";

export type WatchActionState = {
  attempt: number;
  message: string;
  errors?: Record<string, string[]>;
  values?: WatchFormValues;
};

export type WatchFormValues = {
  name: string;
  originAirports: string;
  destinationAirports: string;
  dateMode: string;
  exactDepartureDate: string;
  exactReturnDate: string;
  windowDepartureStart: string;
  windowDepartureEnd: string;
  minTripNights: string;
  maxTripNights: string;
  rollingHorizonDays: string;
  cabins: string[];
  passengers: string;
  maxStops: string;
  maxDurationHours: string;
  peNearInversionPct: string;
  businessVsPePct: string;
};

function stringValue(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function formValues(formData: FormData): WatchFormValues {
  return {
    name: stringValue(formData, "name"),
    originAirports: stringValue(formData, "originAirports"),
    destinationAirports: stringValue(formData, "destinationAirports"),
    dateMode: stringValue(formData, "dateMode"),
    exactDepartureDate: stringValue(formData, "exactDepartureDate"),
    exactReturnDate: stringValue(formData, "exactReturnDate"),
    windowDepartureStart: stringValue(formData, "windowDepartureStart"),
    windowDepartureEnd: stringValue(formData, "windowDepartureEnd"),
    minTripNights: stringValue(formData, "minTripNights"),
    maxTripNights: stringValue(formData, "maxTripNights"),
    rollingHorizonDays: stringValue(formData, "rollingHorizonDays"),
    cabins: formData.getAll("cabins").filter((value): value is string => typeof value === "string"),
    passengers: stringValue(formData, "passengers"),
    maxStops: stringValue(formData, "maxStops"),
    maxDurationHours: stringValue(formData, "maxDurationHours"),
    peNearInversionPct: stringValue(formData, "peNearInversionPct"),
    businessVsPePct: stringValue(formData, "businessVsPePct"),
  };
}

function collectErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string[]> = {};

  for (const issue of issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] = [...(errors[field] ?? []), issue.message];
  }

  return errors;
}

export async function createWatch(
  previousState: WatchActionState,
  formData: FormData,
): Promise<WatchActionState> {
  const values = formValues(formData);
  const errorState = {
    attempt: previousState.attempt + 1,
    values,
  };
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string") {
    return {
      ...errorState,
      message: "Your session has expired. Sign in again before creating a watch.",
    };
  }

  const parsed = watchDraftSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ...errorState,
      message: "Review the marked details before starting this watch.",
      errors: collectErrors(parsed.error.issues),
    };
  }

  const { error } = await supabase.from("watches").insert(toWatchInsert(parsed.data, userId));

  if (error) {
    console.error("Watch creation failed", { code: error.code });
    return {
      ...errorState,
      message: "The watch could not be saved. Your entries are still here; please try again.",
    };
  }

  revalidatePath("/");
  revalidatePath("/watches");
  redirect("/watches");
}
