import type { Metadata } from "next";
import Link from "next/link";

import { evidenceFreshness, scanIsOverdue } from "@/domain/trust";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Watches" };

type WatchRow = Pick<
  Database["public"]["Tables"]["watches"]["Row"],
  | "id"
  | "name"
  | "origin_airports"
  | "destination_airports"
  | "date_mode"
  | "exact_departure_date"
  | "exact_return_date"
  | "window_departure_start"
  | "window_departure_end"
  | "min_trip_nights"
  | "max_trip_nights"
  | "rolling_horizon_days"
  | "cabins"
  | "active"
>;
type CandidateRow = Pick<
  Database["public"]["Tables"]["search_candidates"]["Row"],
  "id" | "watch_id" | "next_scan_at" | "active"
>;
type RunRow = Pick<
  Database["public"]["Tables"]["search_runs"]["Row"],
  "candidate_id" | "finished_at" | "status" | "watch_id"
>;
type AnomalyRow = Pick<
  Database["public"]["Tables"]["anomalies"]["Row"],
  "id" | "watch_id"
>;

const shortDate = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const nextScanFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "America/Vancouver",
});

function formatDate(date: string | null) {
  return date ? shortDate.format(new Date(`${date}T00:00:00Z`)) : "Date pending";
}

function scopeFor(watch: WatchRow) {
  if (watch.date_mode === "EXACT") {
    return {
      detail: "Exact dates",
      headline: `${formatDate(watch.exact_departure_date)} – ${formatDate(watch.exact_return_date)}`,
    };
  }

  if (watch.date_mode === "FLEXIBLE_WINDOW") {
    return {
      detail: `${watch.min_trip_nights}–${watch.max_trip_nights} nights · departure window`,
      headline: `${formatDate(watch.window_departure_start)} – ${formatDate(watch.window_departure_end)}`,
    };
  }

  return {
    detail: `${watch.min_trip_nights}–${watch.max_trip_nights} nights · rolling horizon`,
    headline: `Next ${watch.rolling_horizon_days} days`,
  };
}

function airportSet(airports: string[]) {
  return airports.length > 1 ? `${airports[0]} +${airports.length - 1}` : airports[0];
}

function watchHealth(
  watch: WatchRow,
  candidates: CandidateRow[],
  runs: RunRow[],
  anomalies: AnomalyRow[],
) {
  const watchCandidates = candidates.filter((candidate) => candidate.watch_id === watch.id);
  const candidateIds = new Set(watchCandidates.map((candidate) => candidate.id));
  const watchRuns = runs.filter((run) => run.watch_id === watch.id && candidateIds.has(run.candidate_id));
  const latestByCandidate = new Map<string, RunRow>();
  const latestScan = watchRuns[0]?.finished_at ?? null;
  const latestScanMs = latestScan ? Date.parse(latestScan) : null;

  for (const run of watchRuns) {
    if (latestScanMs !== null && latestScanMs - Date.parse(run.finished_at) > 10 * 60_000) break;
    if (!latestByCandidate.has(run.candidate_id)) latestByCandidate.set(run.candidate_id, run);
  }

  const freshness = evidenceFreshness(latestScan);
  const nextScan = watchCandidates
    .map((candidate) => candidate.next_scan_at)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const checkedCount = latestByCandidate.size;
  const fareCount = [...latestByCandidate.values()].filter((run) => run.status === "VALID_RESULT").length;
  const failedCount = [...latestByCandidate.values()].filter((run) =>
    ["INCOMPLETE_RESULT", "PROVIDER_FAILURE", "THROTTLED"].includes(run.status),
  ).length;
  const anomalyCount = anomalies.filter((anomaly) => anomaly.watch_id === watch.id).length;
  const expectedCount = watchCandidates.length || watch.cabins.length;
  const overdue = scanIsOverdue(nextScan);

  if (!watch.active) {
    return {
      detail: "Scanning is paused",
      schedule: "Not scheduled",
      state: "Paused",
      tone: "paused",
    };
  }

  if (!latestScan) {
    return {
      detail: "Waiting for the first scan",
      schedule: nextScan ? `Due ${nextScanFormatter.format(new Date(nextScan))}` : "Due now",
      state: "Queued",
      tone: "queued",
    };
  }

  if (failedCount > 0) {
    return {
      detail: `${failedCount} ${failedCount === 1 ? "search needs" : "searches need"} attention`,
      schedule: freshness.label,
      state: "Needs attention",
      tone: "failure",
    };
  }

  if (freshness.state === "stale" || overdue) {
    return {
      detail: `${checkedCount}/${expectedCount} checked · ${fareCount} fares found`,
      schedule: overdue ? "Next scan overdue" : freshness.label,
      state: "Stale",
      tone: "stale",
    };
  }

  if (anomalyCount > 0) {
    return {
      detail: `${anomalyCount} active ${anomalyCount === 1 ? "relationship" : "relationships"}`,
      schedule: freshness.label,
      state: "Active signal",
      tone: "signal",
    };
  }

  if (checkedCount < expectedCount) {
    return {
      detail: `${checkedCount}/${expectedCount} searches checked`,
      schedule: freshness.label,
      state: "Partial scan",
      tone: "partial",
    };
  }

  if (fareCount < expectedCount) {
    return {
      detail: `${checkedCount}/${expectedCount} checked · ${fareCount} fares found`,
      schedule: freshness.label,
      state: "Partial fares",
      tone: "partial",
    };
  }

  return {
    detail: `${checkedCount}/${expectedCount} checked · all fares found`,
    schedule: freshness.label,
    state: "Quiet",
    tone: freshness.state === "aging" ? "aging" : "quiet",
  };
}

export default async function WatchesPage() {
  const supabase = await createClient();
  const [watchResult, candidateResult, runResult, anomalyResult] = await Promise.all([
    supabase
      .from("watches")
      .select("id,name,origin_airports,destination_airports,date_mode,exact_departure_date,exact_return_date,window_departure_start,window_departure_end,min_trip_nights,max_trip_nights,rolling_horizon_days,cabins,active")
      .order("updated_at", { ascending: false }),
    supabase
      .from("search_candidates")
      .select("id,watch_id,next_scan_at,active")
      .eq("active", true)
      .limit(1000),
    supabase
      .from("search_runs")
      .select("candidate_id,finished_at,status,watch_id")
      .order("finished_at", { ascending: false })
      .limit(2000),
    supabase
      .from("anomalies")
      .select("id,watch_id")
      .is("resolved_at", null)
      .limit(500),
  ]);

  const watches = (watchResult.data ?? []) as WatchRow[];
  const candidates = (candidateResult.data ?? []) as CandidateRow[];
  const runs = (runResult.data ?? []) as RunRow[];
  const anomalies = (anomalyResult.data ?? []) as AnomalyRow[];
  const activeCount = watches.filter((watch) => watch.active).length;
  const monitoringError = Boolean(
    watchResult.error || candidateResult.error || runResult.error || anomalyResult.error,
  );

  return (
    <div className="page-frame watches-page">
      <header className="registry-header">
        <div>
          <p className="eyebrow">Monitoring desk</p>
          <h1>Watches</h1>
          <p className="hero-deck">
            Each route keeps its dates, cabin boundaries, latest evidence, and next scheduled scan together.
          </p>
        </div>
        <div className="registry-actions">
          <p><strong>{activeCount}</strong> active {activeCount === 1 ? "watch" : "watches"}</p>
          <Link className="primary-button" href="/watches/new">
            Create a watch <span aria-hidden="true">→</span>
          </Link>
        </div>
      </header>

      <section className="registry" aria-labelledby="live-registry-heading">
        <div className="registry-rule">
          <h2 id="live-registry-heading">Monitoring now</h2>
          <span>{monitoringError ? "Some monitoring details are unavailable" : "Activity, freshness, and coverage"}</span>
        </div>
        {watches.map((watch, index) => {
          const scope = scopeFor(watch);
          const health = watchHealth(watch, candidates, runs, anomalies);
          return (
            <Link className="watch-entry" href={`/watches/${watch.id}`} key={watch.id}>
              <span className="entry-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="entry-route-block">
                <span className="entry-route">
                  <strong>{airportSet(watch.origin_airports)}</strong>
                  <span className="entry-route-arrow" aria-hidden="true">→</span>
                  <span className="sr-only"> to </span>
                  <strong>{airportSet(watch.destination_airports)}</strong>
                </span>
                <small>{watch.name}</small>
              </span>
              <span className="entry-scope">
                {scope.headline}<small>{scope.detail}</small>
              </span>
              <span className="entry-state" data-tone={health.tone}>
                {health.state}<small>{health.detail}</small>
              </span>
              <span className="entry-schedule">
                {health.schedule}<small>{watch.cabins.length} cabin {watch.cabins.length === 1 ? "search" : "searches"}</small>
              </span>
              <span className="entry-arrow" aria-hidden="true">→</span>
            </Link>
          );
        })}
      </section>

      {watches.length === 0 ? (
        <section className="registry-empty" aria-labelledby="empty-registry-heading">
          <div>
            <p className="eyebrow">Monitoring now</p>
            <h2 id="empty-registry-heading">
              {watchResult.error ? "The watch list could not be read." : "No watches yet."}
            </h2>
          </div>
          <p>
            {watchResult.error
              ? "Your session is intact, but the watch list is temporarily unavailable. Refresh before creating a duplicate."
              : "Create an Anytime, Window, or Exact watch to start building comparable cross-cabin evidence."}
          </p>
        </section>
      ) : null}
    </div>
  );
}
