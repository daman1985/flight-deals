"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { toWatchInsert, watchDraftSchema } from "@/domain/watch";
import { createClient } from "@/lib/supabase/server";

export type WatchActionState = {
  message: string;
  errors?: Record<string, string[]>;
};

function collectErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string[]> = {};

  for (const issue of issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] = [...(errors[field] ?? []), issue.message];
  }

  return errors;
}

export async function createWatch(
  _previousState: WatchActionState,
  formData: FormData,
): Promise<WatchActionState> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string") {
    return { message: "Your session has expired. Sign in again before creating a watch." };
  }

  const parsed = watchDraftSchema.safeParse({
    name: formData.get("name"),
    originAirports: formData.get("originAirports"),
    destinationAirports: formData.get("destinationAirports"),
    dateMode: formData.get("dateMode"),
    exactDepartureDate: formData.get("exactDepartureDate"),
    exactReturnDate: formData.get("exactReturnDate"),
    windowDepartureStart: formData.get("windowDepartureStart"),
    windowDepartureEnd: formData.get("windowDepartureEnd"),
    minTripNights: formData.get("minTripNights"),
    maxTripNights: formData.get("maxTripNights"),
    rollingHorizonDays: formData.get("rollingHorizonDays"),
    cabins: formData.getAll("cabins"),
    passengers: formData.get("passengers"),
    maxStops: formData.get("maxStops"),
    maxDurationHours: formData.get("maxDurationHours"),
    peNearInversionPct: formData.get("peNearInversionPct"),
    businessVsPePct: formData.get("businessVsPePct"),
  });

  if (!parsed.success) {
    return {
      message: "Review the marked details before starting this watch.",
      errors: collectErrors(parsed.error.issues),
    };
  }

  const { error } = await supabase.from("watches").insert(toWatchInsert(parsed.data, userId));

  if (error) {
    console.error("Watch creation failed", { code: error.code });
    return {
      message: "The watch could not be saved. Your entries are still here; please try again.",
    };
  }

  revalidatePath("/");
  revalidatePath("/watches");
  redirect("/watches");
}
