import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";
import type { ConfirmedAlertEntry } from "@/app/_components/confirmed-alert-ledger";
import { historicalContextFromJson } from "@/domain/history";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AlertRow = Database["public"]["Tables"]["alerts"]["Row"];
type AnomalyRow = Database["public"]["Tables"]["anomalies"]["Row"];
type AnomalyAlertRow = Pick<AnomalyRow,
  | "id" | "watch_id" | "origin" | "destination" | "departure_date" | "return_date"
  | "lower_cabin" | "higher_cabin" | "lower_cabin_price" | "higher_cabin_price"
  | "spread_amount" | "spread_pct" | "confidence" | "confirmed_at" | "explanation_json"
  | "type" | "severity"
>;

const alertFields = "id,anomaly_id,channel,created_at,sent_at,delivery_status";
const anomalyFields = "id,watch_id,origin,destination,departure_date,return_date,lower_cabin,higher_cabin,lower_cabin_price,higher_cabin_price,spread_amount,spread_pct,confidence,confirmed_at,explanation_json,type,severity";

type Snapshot = Record<string, unknown>;

function asRecord(value: unknown): Snapshot | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Snapshot
    : null;
}

function snapshotString(snapshot: Snapshot, key: string, fallback: string | null): string | null {
  if (!Object.hasOwn(snapshot, key)) return fallback;
  return typeof snapshot[key] === "string" ? snapshot[key] as string : null;
}

function snapshotNumber(snapshot: Snapshot, key: string, fallback: number | null): number | null {
  if (!Object.hasOwn(snapshot, key)) return fallback;
  return typeof snapshot[key] === "number" && Number.isFinite(snapshot[key])
    ? snapshot[key] as number
    : null;
}

export function confirmedAnomalyView(anomaly: AnomalyAlertRow): ConfirmedAlertEntry["anomaly"] | null {
  const explanation = asRecord(anomaly.explanation_json);
  const snapshot = asRecord(explanation?.confirmation) ?? {};
  const historicalContext = historicalContextFromJson(
    snapshot.historical_context ?? explanation?.historical_context,
  );
  const confirmedAt = snapshotString(snapshot, "confirmed_at", anomaly.confirmed_at) ?? anomaly.confirmed_at;
  if (!confirmedAt) return null;

  return {
    id: anomaly.id,
    origin: snapshotString(snapshot, "origin", anomaly.origin) ?? anomaly.origin,
    destination: snapshotString(snapshot, "destination", anomaly.destination) ?? anomaly.destination,
    departure_date: snapshotString(snapshot, "departure_date", anomaly.departure_date) ?? anomaly.departure_date,
    return_date: snapshotString(snapshot, "return_date", anomaly.return_date),
    lower_cabin: snapshotString(snapshot, "lower_cabin", anomaly.lower_cabin),
    higher_cabin: snapshotString(snapshot, "higher_cabin", anomaly.higher_cabin),
    lower_cabin_price: snapshotNumber(snapshot, "lower_cabin_price", anomaly.lower_cabin_price),
    higher_cabin_price: snapshotNumber(snapshot, "higher_cabin_price", anomaly.higher_cabin_price),
    spread_amount: snapshotNumber(snapshot, "spread_amount", anomaly.spread_amount),
    spread_pct: snapshotNumber(snapshot, "spread_pct", anomaly.spread_pct),
    confidence: anomaly.confidence,
    confirmed_at: confirmedAt,
    currency: snapshotString(snapshot, "currency", "CAD") ?? "CAD",
    type: snapshotString(snapshot, "type", anomaly.type) ?? anomaly.type,
    severity: snapshotString(snapshot, "severity", anomaly.severity) ?? anomaly.severity,
    outbound_stop_bucket: snapshotString(snapshot, "outbound_stop_bucket", null),
    return_stop_bucket: snapshotString(snapshot, "return_stop_bucket", null),
    lower_observation_id: snapshotString(snapshot, "lower_observation_id", null),
    higher_observation_id: snapshotString(snapshot, "higher_observation_id", null),
    lower_run_id: snapshotString(snapshot, "lower_run_id", null),
    higher_run_id: snapshotString(snapshot, "higher_run_id", null),
    historical_context: historicalContext,
  };
}

export async function getConfirmedInAppAlerts(
  supabase: SupabaseClient,
  { watchId, limit = 20 }: { watchId?: string; limit?: number } = {},
): Promise<{ entries: ConfirmedAlertEntry[]; error: boolean }> {
  let alertRows: AlertRow[] = [];
  let anomalyRows: AnomalyAlertRow[] = [];

  if (watchId) {
    const anomalies = await supabase
      .from("anomalies")
      .select(anomalyFields)
      .eq("watch_id", watchId)
      .not("confirmed_at", "is", null)
      .order("confirmed_at", { ascending: false })
      .limit(100);
    if (anomalies.error) return { entries: [], error: true };
    anomalyRows = (anomalies.data ?? []) as unknown as AnomalyAlertRow[];
    if (anomalyRows.length === 0) return { entries: [], error: false };

    const alerts = await supabase
      .from("alerts")
      .select(alertFields)
      .eq("channel", "in_app")
      .in("anomaly_id", anomalyRows.map((anomaly) => anomaly.id))
      .order("created_at", { ascending: false })
      .limit(limit);
    if (alerts.error) return { entries: [], error: true };
    alertRows = (alerts.data ?? []) as AlertRow[];
  } else {
    const alerts = await supabase
      .from("alerts")
      .select(alertFields)
      .eq("channel", "in_app")
      .order("created_at", { ascending: false })
      .limit(100);
    if (alerts.error) return { entries: [], error: true };
    alertRows = (alerts.data ?? []) as AlertRow[];
    if (alertRows.length === 0) return { entries: [], error: false };

    const anomalies = await supabase
      .from("anomalies")
      .select(anomalyFields)
      .in("id", alertRows.map((alert) => alert.anomaly_id))
      .not("confirmed_at", "is", null);
    if (anomalies.error) return { entries: [], error: true };
    anomalyRows = (anomalies.data ?? []) as unknown as AnomalyAlertRow[];
  }

  const confirmedById = new Map(
    anomalyRows
      .filter((anomaly) => anomaly.confirmed_at !== null && (!watchId || anomaly.watch_id === watchId))
      .map((anomaly) => [anomaly.id, anomaly]),
  );
  const matchingAlerts = alertRows.filter((alert) => confirmedById.has(alert.anomaly_id));
  if (matchingAlerts.length === 0) return { entries: [], error: false };

  const watchIds = [...new Set([...confirmedById.values()].map((anomaly) => anomaly.watch_id))];
  const watchesResult = await supabase
    .from("watches")
    .select("id,name")
    .in("id", watchIds);
  if (watchesResult.error) return { entries: [], error: true };
  const watchById = new Map((watchesResult.data ?? []).map((watch) => [watch.id, watch]));

  const entries = matchingAlerts.flatMap((alert) => {
    const anomaly = confirmedById.get(alert.anomaly_id);
    const watch = anomaly ? watchById.get(anomaly.watch_id) : undefined;
    const confirmedAnomaly = anomaly ? confirmedAnomalyView(anomaly) : null;
    return confirmedAnomaly && watch
      ? [{ alert, anomaly: confirmedAnomaly, watch }]
      : [];
  });

  return { entries: entries.slice(0, limit), error: false };
}
