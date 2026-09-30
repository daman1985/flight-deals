import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Live watch" };

type Watch = Database["public"]["Tables"]["watches"]["Row"];
type Candidate = Database["public"]["Tables"]["search_candidates"]["Row"];
type SearchRun = Database["public"]["Tables"]["search_runs"]["Row"];
type Observation = Omit<
  Database["public"]["Tables"]["fare_observations"]["Row"],
  "raw_payload_json"
>;
type Anomaly = Database["public"]["Tables"]["anomalies"]["Row"];

const cabinOrder = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"];
const cabinNames: Record<string, string> = {
  ECONOMY: "Economy",
  PREMIUM_ECONOMY: "Premium Economy",
  BUSINESS: "Business",
  FIRST: "First",
};
const cabinCodes: Record<string, string> = {
  ECONOMY: "Y",
  PREMIUM_ECONOMY: "W",
  BUSINESS: "J",
  FIRST: "F",
};
const statusLabels: Record<string, string> = {
  VALID_RESULT: "Valid result",
  NO_RESULT: "No result",
  INCOMPLETE_RESULT: "Incomplete",
  PROVIDER_FAILURE: "Provider failure",
  THROTTLED: "Throttled",
};
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const timestampFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Vancouver",
  timeZoneName: "short",
});
const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(`${value}T00:00:00Z`)) : "Open";
}

function dateScope(watch: Watch) {
  if (watch.date_mode === "EXACT") {
    return {
      folio: "Exact-date watch",
      outbound: formatDate(watch.exact_departure_date),
      inbound: formatDate(watch.exact_return_date),
    };
  }
  if (watch.date_mode === "FLEXIBLE_WINDOW") {
    return {
      folio: `${watch.min_trip_nights}–${watch.max_trip_nights} night window`,
      outbound: formatDate(watch.window_departure_start),
      inbound: formatDate(watch.window_departure_end),
    };
  }
  return {
    folio: `${watch.rolling_horizon_days}-day rolling watch`,
    outbound: "Tomorrow",
    inbound: `${watch.min_trip_nights}–${watch.max_trip_nights} nights`,
  };
}

function freshness(value: string | null) {
  if (!value) return "Awaiting first scan";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 2) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Updated ${hours} hr ago`;
  return `Updated ${Math.round(hours / 24)} days ago`;
}

function latestByCandidate(runs: SearchRun[]) {
  const latest = new Map<string, SearchRun>();
  for (const run of runs) {
    if (!latest.has(run.candidate_id)) latest.set(run.candidate_id, run);
  }
  return latest;
}

function lowestByCabin(observations: Observation[], currentRunIds: Set<string>) {
  const lowest = new Map<string, Observation>();
  for (const observation of observations) {
    if (!currentRunIds.has(observation.search_run_id)) continue;
    const existing = lowest.get(observation.cabin);
    if (!existing || observation.total_price < existing.total_price) {
      lowest.set(observation.cabin, observation);
    }
  }
  return lowest;
}

function signalCopy(anomaly: Anomaly | undefined, latestScan: string | null) {
  if (anomaly) {
    const lower = anomaly.lower_cabin ? cabinNames[anomaly.lower_cabin] : "Lower cabin";
    const higher = anomaly.higher_cabin ? cabinNames[anomaly.higher_cabin] : "Higher cabin";
    return {
      eyebrow: "Active relationship / 01",
      title: `${higher} is unusually close to ${lower}.`,
      detail: "The comparison uses the same route, dates, and quality-eligible acquisition batch.",
      metric: anomaly.spread_pct === null ? "Signal" : `${anomaly.spread_pct > 0 ? "+" : ""}${anomaly.spread_pct.toFixed(1)}%`,
    };
  }
  if (latestScan) {
    return {
      eyebrow: "Monitoring state / 01",
      title: "No cross-cabin anomaly in the latest complete evidence.",
      detail: "The live fares below remain useful evidence. A missing cabin stays missing and never becomes a false price increase.",
      metric: "Clear",
    };
  }
  return {
    eyebrow: "Monitoring state / 01",
    title: "This watch is queued for its first live acquisition.",
    detail: "The planner can create the route-date-cabin candidates without exposing provider controls in the browser.",
    metric: "Queued",
  };
}

export default async function LiveWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: watchData, error: watchError } = await supabase
    .from("watches")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (watchError || !watchData) notFound();
  const watch = watchData as Watch;
  const [candidateResult, runResult, observationResult, anomalyResult] = await Promise.all([
    supabase.from("search_candidates").select("*").eq("watch_id", id).order("priority", { ascending: false }).order("departure_date", { ascending: true }).limit(200),
    supabase.from("search_runs").select("*").eq("watch_id", id).order("finished_at", { ascending: false }).limit(400),
    supabase.from("fare_observations").select("id,watch_id,search_run_id,provider,origin,destination,departure_date,return_date,cabin,airline,flight_numbers,stops_outbound,stops_return,duration_outbound_minutes,duration_return_minutes,total_price,currency,booking_url,observed_at,confirmed,quality_eligible").eq("watch_id", id).order("observed_at", { ascending: false }).limit(1000),
    supabase.from("anomalies").select("*").eq("watch_id", id).is("resolved_at", null).order("first_detected_at", { ascending: false }).limit(1),
  ]);

  const candidates = (candidateResult.data ?? []) as Candidate[];
  const runs = (runResult.data ?? []) as SearchRun[];
  const observations = (observationResult.data ?? []) as Observation[];
  const anomalies = (anomalyResult.data ?? []) as Anomaly[];
  const currentRuns = latestByCandidate(runs);
  const currentValidRunIds = new Set(
    [...currentRuns.values()].filter((run) => run.status === "VALID_RESULT").map((run) => run.id),
  );
  const fares = lowestByCabin(observations, currentValidRunIds);
  const latestScan = runs[0]?.finished_at ?? null;
  const signal = signalCopy(anomalies[0], latestScan);
  const scope = dateScope(watch);
  const healthyCount = [...currentRuns.values()].filter((run) => run.status === "VALID_RESULT").length;
  const nextScan = candidates.map((candidate) => candidate.next_scan_at).filter((value): value is string => Boolean(value)).sort()[0] ?? null;

  return (
    <div className="page-frame detail-page live-detail-page">
      <header className="watch-hero">
        <div className="watch-topline">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/watches">Watches</Link><span aria-hidden="true">/</span><span>{watch.name}</span>
          </nav>
          <p className="live-label">Live Supabase evidence</p>
        </div>
        <div className="route-lockup">
          <div>
            <p className="folio">{scope.folio}</p>
            <h1><span>{watch.origin_airports[0]}</span><i aria-hidden="true">→</i><span>{watch.destination_airports[0]}</span></h1>
            <p className="route-names">{watch.name}{(watch.origin_airports.length > 1 || watch.destination_airports.length > 1) ? <span>+ additional airport pairs</span> : null}</p>
          </div>
          <dl className="route-facts">
            <div><dt>Outbound</dt><dd>{scope.outbound}</dd></div>
            <div><dt>Return / scope</dt><dd>{scope.inbound}</dd></div>
            <div><dt>Cabins</dt><dd>{watch.cabins.map((cabin) => cabinCodes[cabin]).join(" / ")}</dd></div>
            <div><dt>Currency</dt><dd>CAD</dd></div>
          </dl>
          <div className="trust-block" aria-label="Live data status">
            <span className="system-dot system-dot-live" aria-hidden="true" />
            <strong>{freshness(latestScan)}</strong>
            <small>{latestScan ? timestampFormatter.format(new Date(latestScan)) : "No search run yet"}</small>
          </div>
        </div>
      </header>

      <section className="signal-brief" aria-labelledby="state-heading">
        <div className="signal-story">
          <p className="eyebrow">{signal.eyebrow}</p><h2 id="state-heading">{signal.title}</h2><p>{signal.detail}</p>
        </div>
        <div className="signal-metric">
          <span>Current signal</span><strong>{signal.metric}</strong><small>{anomalies.length ? "Observed / awaiting reconfirmation" : "Deterministic comparison"}</small>
        </div>
      </section>

      <section className="data-section" aria-labelledby="live-cabin-heading">
        <div className="section-heading-row">
          <div><p className="eyebrow">Cabin ledger / 02</p><h2 id="live-cabin-heading">Latest valid fare in each requested cabin.</h2></div>
          <p className="section-scope">Live acquisition · CAD · lowest current offer</p>
        </div>
        <ol className="cabin-ladder" aria-label="Live fares by cabin">
          {cabinOrder.filter((cabin) => watch.cabins.includes(cabin)).map((cabin) => {
            const fare = fares.get(cabin);
            const candidate = candidates.find((item) => item.cabin === cabin);
            const run = candidate ? currentRuns.get(candidate.id) : undefined;
            return (
              <li key={cabin}>
                <div className="cabin-row">
                  <span className="ladder-code" aria-hidden="true">{cabinCodes[cabin]}</span>
                  <span className="ladder-name">{cabinNames[cabin]}<small>{run ? statusLabels[run.status] ?? run.status : "Awaiting scan"}</small></span>
                  <strong>{fare ? currencyFormatter.format(fare.total_price) : "—"}</strong>
                </div>
                {fare ? <p className="fare-provenance">{fare.airline ?? "Airline not reported"} · {fare.stops_outbound ?? "?"} outbound stops · observed {timestampFormatter.format(new Date(fare.observed_at))}</p> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="scan-health" aria-labelledby="health-heading">
        <div><p className="eyebrow">Search health / 03</p><h2 id="health-heading">{runs.length ? "Provider health is tracked apart from fare movement." : "Ready for the first bounded worker rotation."}</h2></div>
        <dl>
          <div><dt>Provider</dt><dd>{runs[0]?.provider ?? "fli · queued"}</dd></div>
          <div><dt>Current coverage</dt><dd>{healthyCount} of {candidates.length || watch.cabins.length} candidates valid</dd></div>
          <div><dt>Next due scan</dt><dd>{nextScan ? timestampFormatter.format(new Date(nextScan)) : "Due now"}</dd></div>
        </dl>
      </section>

      <section className="run-ledger" aria-labelledby="run-ledger-heading">
        <div className="registry-rule"><h2 id="run-ledger-heading">Recent acquisition record</h2><span>No raw provider payloads exposed</span></div>
        <div className="run-ledger-table" role="table" aria-label="Recent search runs">
          {runs.slice(0, 8).map((run) => {
            const candidate = candidates.find((item) => item.id === run.candidate_id);
            return (
              <div className="run-ledger-row" role="row" key={run.id}>
                <span role="cell">{candidate ? cabinCodes[candidate.cabin] : "—"}</span><strong role="cell">{statusLabels[run.status] ?? run.status}</strong><span role="cell">{run.result_count} {run.result_count === 1 ? "offer" : "offers"}</span><span role="cell">{run.latency_ms === null ? "Latency unavailable" : `${(run.latency_ms / 1000).toFixed(1)}s`}</span><time role="cell" dateTime={run.finished_at}>{timestampFormatter.format(new Date(run.finished_at))}</time>
              </div>
            );
          })}
          {runs.length === 0 ? <p className="ledger-empty">No search runs have been recorded yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
