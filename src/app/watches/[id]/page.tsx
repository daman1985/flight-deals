/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RelativeTime } from "@/app/_components/relative-time";
import { ConfirmedAlertLedger } from "@/app/_components/confirmed-alert-ledger";
import { calculateCabinSpread } from "@/domain/spread";
import { evidenceFreshness, scanIsOverdue } from "@/domain/trust";
import { getConfirmedInAppAlerts } from "@/lib/supabase/confirmed-alerts";
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
  VALID_RESULT: "Fare found",
  NO_RESULT: "No eligible fare",
  INCOMPLETE_RESULT: "Incomplete result",
  PROVIDER_FAILURE: "Provider failure",
  THROTTLED: "Provider throttled",
};
const successfulStatuses = new Set(["VALID_RESULT", "NO_RESULT"]);
const failureStatuses = new Set(["INCOMPLETE_RESULT", "PROVIDER_FAILURE", "THROTTLED"]);
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
      folio: "Exact dates",
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
    outbound: "Rolling departures",
    inbound: `${watch.min_trip_nights}–${watch.max_trip_nights} nights`,
  };
}

function scopeKey(candidate: Pick<Candidate, "origin" | "destination" | "departure_date" | "return_date">) {
  return [candidate.origin, candidate.destination, candidate.departure_date, candidate.return_date ?? ""].join("|");
}

function latestCycleByCandidate(runs: SearchRun[], candidateById: Map<string, Candidate>) {
  const latest = runs[0];
  const cycle = new Map<string, SearchRun>();
  if (!latest) return cycle;

  const latestCandidate = candidateById.get(latest.candidate_id);
  if (!latestCandidate) return cycle;
  const latestScopeKey = scopeKey(latestCandidate);

  const latestFinishedAt = Date.parse(latest.finished_at);
  const cycleWindowMs = 10 * 60_000;

  for (const run of runs) {
    const ageFromLatest = latestFinishedAt - Date.parse(run.finished_at);
    if (ageFromLatest > cycleWindowMs) break;
    const candidate = candidateById.get(run.candidate_id);
    if (!candidate || scopeKey(candidate) !== latestScopeKey) continue;
    if (!cycle.has(run.candidate_id)) cycle.set(run.candidate_id, run);
  }

  return cycle;
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

function stopsCopy(stops: number | null) {
  if (stops === 0) return "Nonstop outbound";
  if (stops === 1) return "1 outbound stop";
  if (typeof stops === "number") return `${stops} outbound stops`;
  return "Stops not reported";
}

function relationshipToEconomy(
  cabin: string,
  fare: Observation | undefined,
  economyFare: Observation | undefined,
) {
  if (cabin === "ECONOMY") return "Reference fare for cabin comparisons";
  if (!fare) return "No comparable fare returned";
  if (!economyFare) return "Economy reference unavailable";

  const spread = calculateCabinSpread(economyFare.total_price, fare.total_price);
  const amount = currencyFormatter.format(Math.abs(spread.amount));
  const direction = spread.amount < 0 ? "less" : "more";
  const signedPercent = `${spread.percent > 0 ? "+" : ""}${spread.percent.toFixed(1)}%`;
  return `${amount} ${direction} than Economy · ${signedPercent}`;
}

function signalSummary({
  anomaly,
  dataReadFailed,
  fareCount,
  freshnessState,
  missingCabins,
  overdue,
  scanComplete,
}: {
  anomaly: Anomaly | undefined;
  dataReadFailed: boolean;
  fareCount: number;
  freshnessState: "queued" | "live" | "aging" | "stale";
  missingCabins: string[];
  overdue: boolean;
  scanComplete: boolean;
}) {
  if (dataReadFailed) {
    return {
      detail: "The watch is intact, but its latest search evidence could not be read. Try again before acting on a fare.",
      label: "Needs attention",
      metric: "Error",
      title: "The latest evidence is temporarily unavailable.",
      tone: "failure",
    };
  }

  if (freshnessState === "queued") {
    return {
      detail: "The route and cabin candidates are ready. Prices will appear after the first acquisition completes.",
      label: "Monitoring state",
      metric: "Queued",
      title: "Waiting for the first scan.",
      tone: "queued",
    };
  }

  if (freshnessState === "stale" || overdue) {
    return {
      detail: overdue
        ? "The next scheduled scan is overdue. Treat these fares as historical evidence until a new scan completes."
        : "The latest check is more than three hours old. Treat these fares as historical evidence until a new scan completes.",
      label: "Trust state",
      metric: "Stale",
      title: "Evidence may have changed.",
      tone: "stale",
    };
  }

  if (!scanComplete) {
    return {
      detail: "Not every cabin search for this exact route and date pair completed in the latest cycle, so no complete relationship conclusion is shown.",
      label: "Trust state",
      metric: "Partial",
      title: "The latest scan is incomplete.",
      tone: "partial",
    };
  }

  if (missingCabins.length > 0) {
    const names = missingCabins.map((cabin) => cabinNames[cabin] ?? cabin).join(" and ");
    return {
      detail: `${fareCount} current ${fareCount === 1 ? "fare was" : "fares were"} found. Every requested cabin was checked, but missing fares remain missing and never become price increases.`,
      label: "Fare availability",
      metric: "Partial",
      title: `${names} returned no eligible fare.`,
      tone: "partial",
    };
  }

  if (anomaly) {
    const lower = anomaly.lower_cabin ? cabinNames[anomaly.lower_cabin] : "Lower cabin";
    const higher = anomaly.higher_cabin ? cabinNames[anomaly.higher_cabin] : "Higher cabin";
    return {
      detail: "The comparison uses the same route, dates, and quality-eligible acquisition cycle.",
      label: anomaly.confirmed_at ? "Reconfirmed relationship" : "Relationship detected",
      metric:
        anomaly.spread_pct === null
          ? "Signal"
          : `${anomaly.spread_pct > 0 ? "+" : ""}${anomaly.spread_pct.toFixed(1)}%`,
      title: `${higher} is unusually close to ${lower}.`,
      tone: "signal",
    };
  }

  return {
    detail: "All requested cabins were checked against the current watch constraints. Historical baselines are still being gathered.",
    label: "Monitoring state",
    metric: "Quiet",
    title: "No unusual cabin relationship was detected.",
    tone: freshnessState === "aging" ? "aging" : "quiet",
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
  const [candidateResult, runResult, observationResult, anomalyResult, confirmedAlertResult] = await Promise.all([
    supabase
      .from("search_candidates")
      .select("*")
      .eq("watch_id", id)
      .eq("active", true)
      .order("priority", { ascending: false })
      .order("departure_date", { ascending: true })
      .limit(200),
    supabase
      .from("search_runs")
      .select("*")
      .eq("watch_id", id)
      .order("finished_at", { ascending: false })
      .limit(400),
    supabase
      .from("fare_observations")
      .select("id,watch_id,search_run_id,provider,origin,destination,departure_date,return_date,cabin,airline,flight_numbers,stops_outbound,stops_return,duration_outbound_minutes,duration_return_minutes,total_price,currency,booking_url,observed_at,confirmed,quality_eligible")
      .eq("watch_id", id)
      .order("observed_at", { ascending: false })
      .limit(1000),
    supabase
      .from("anomalies")
      .select("*")
      .eq("watch_id", id)
      .is("resolved_at", null)
      .order("first_detected_at", { ascending: false })
      .limit(100),
    getConfirmedInAppAlerts(supabase, { watchId: id, limit: 8 }),
  ]);

  const candidates = (candidateResult.data ?? []) as Candidate[];
  const runs = (runResult.data ?? []) as SearchRun[];
  const observations = (observationResult.data ?? []) as Observation[];
  const anomalies = (anomalyResult.data ?? []) as Anomaly[];
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const currentRuns = runs.filter((run) => candidateById.has(run.candidate_id));
  const latestCandidate = currentRuns[0]
    ? candidateById.get(currentRuns[0].candidate_id)
    : undefined;
  const currentScopeKey = latestCandidate ? scopeKey(latestCandidate) : null;
  const scopeCandidates = currentScopeKey
    ? candidates.filter((candidate) => scopeKey(candidate) === currentScopeKey)
    : [];
  const candidateByCabin = new Map(scopeCandidates.map((candidate) => [candidate.cabin, candidate]));
  const cycleRuns = latestCycleByCandidate(currentRuns, candidateById);
  const currentValidRunIds = new Set(
    [...cycleRuns.values()]
      .filter((run) => run.status === "VALID_RESULT")
      .map((run) => run.id),
  );
  const fares = lowestByCabin(observations, currentValidRunIds);
  const latestScan = currentRuns[0]?.finished_at ?? null;
  const freshness = evidenceFreshness(latestScan);
  const scope = dateScope(watch);
  const currentScopeLabel = latestCandidate
    ? `${latestCandidate.origin} → ${latestCandidate.destination} · ${formatDate(latestCandidate.departure_date)}${latestCandidate.return_date ? ` – ${formatDate(latestCandidate.return_date)}` : ""}`
    : null;
  const nextScan = candidates
    .map((candidate) => candidate.next_scan_at)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const checkedCount = cycleRuns.size;
  const expectedCabinSearches = watch.cabins.length;
  const scanComplete =
    expectedCabinSearches > 0 &&
    scopeCandidates.length === expectedCabinSearches &&
    checkedCount / expectedCabinSearches >= 0.9;
  const failedCount = [...cycleRuns.values()].filter((run) => failureStatuses.has(run.status)).length;
  const missingCabins = watch.cabins.filter((cabin) => !fares.has(cabin));
  const currentAnomaly = latestCandidate
    ? anomalies.find((anomaly) =>
        anomaly.origin === latestCandidate.origin &&
        anomaly.destination === latestCandidate.destination &&
        anomaly.departure_date === latestCandidate.departure_date &&
        anomaly.return_date === latestCandidate.return_date,
      )
    : undefined;
  const overdue = scanIsOverdue(nextScan);
  const dataReadFailed = Boolean(
    candidateResult.error || runResult.error || observationResult.error || anomalyResult.error,
  );
  const signal = signalSummary({
    anomaly: currentAnomaly,
    dataReadFailed,
    fareCount: fares.size,
    freshnessState: freshness.state,
    missingCabins,
    overdue,
    scanComplete,
  });
  const economyFare = fares.get("ECONOMY");
  const statusLabel =
    signal.tone === "signal"
      ? "Active relationship"
      : signal.tone === "stale"
        ? "Stale evidence"
        : signal.tone === "partial"
          ? "Partial evidence"
          : signal.tone === "failure"
            ? "Evidence unavailable"
            : freshness.state === "live"
              ? "Current evidence"
              : freshness.state === "aging"
                ? "Aging evidence"
                : "Awaiting evidence";

  return (
    <div className="page-frame detail-page live-detail-page">
      <header className="watch-hero">
        <div className="watch-topline">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/watches">Watches</Link>
            <span aria-hidden="true">/</span>
            <span>{watch.name}</span>
          </nav>
          <p className="evidence-label" data-state={signal.tone}>{statusLabel}</p>
        </div>
        <div className="route-lockup">
          <div className="route-identity">
            <p className="folio">{scope.folio}</p>
            <h1>
              <span>{watch.origin_airports[0]}</span>
              <span className="route-arrow" aria-hidden="true">→</span>
              <span className="sr-only"> to </span>
              <span>{watch.destination_airports[0]}</span>
            </h1>
            <p className="route-names">
              {watch.name}
              {watch.origin_airports.length > 1 || watch.destination_airports.length > 1 ? (
                <span>Additional airport pairs included</span>
              ) : null}
            </p>
          </div>
          <dl className="route-facts">
            <div><dt>Outbound</dt><dd>{scope.outbound}</dd></div>
            <div><dt>Return / scope</dt><dd>{scope.inbound}</dd></div>
            <div><dt>Cabins</dt><dd>{watch.cabins.map((cabin) => cabinNames[cabin]).join(" · ")}</dd></div>
            <div><dt>Currency</dt><dd>CAD round trip</dd></div>
          </dl>
        </div>
      </header>

      <section className="signal-summary" data-tone={signal.tone} aria-labelledby="state-heading">
        <div className="signal-summary-copy">
          <p className="eyebrow">{signal.label}</p>
          <h2 id="state-heading">{signal.title}</h2>
          <p>{signal.detail}</p>
        </div>
        <div className="signal-summary-metric">
          <span>Current conclusion</span>
          <strong>{signal.metric}</strong>
        </div>
        <dl className="trust-row" aria-label="Evidence trust summary">
          <div>
            <dt>Last checked</dt>
            <dd>
              {latestScan ? (
                <RelativeTime
                  initialLabel={freshness.label}
                  initialState={freshness.state}
                  timestamp={latestScan}
                />
              ) : freshness.label}
            </dd>
          </div>
          <div><dt>Scan completion</dt><dd>{checkedCount} of {expectedCabinSearches} cabin searches checked</dd></div>
          <div><dt>Fare availability</dt><dd>{fares.size} of {watch.cabins.length} cabins found</dd></div>
          <div><dt>Next scan</dt><dd>{overdue ? "Overdue" : nextScan ? timestampFormatter.format(new Date(nextScan)) : "Not scheduled"}</dd></div>
        </dl>
      </section>

      <section className="watch-confirmed-alerts" aria-labelledby="watch-alert-heading">
        <div className="watch-confirmed-alerts-heading">
          <div>
            <p className="eyebrow">Reconfirmed signals</p>
            <h2 id="watch-alert-heading">In-app alerts for this watch.</h2>
          </div>
          <Link className="text-link" href="/">Briefing ledger →</Link>
        </div>
        <ConfirmedAlertLedger
          alerts={confirmedAlertResult.entries}
          emptyMessage={confirmedAlertResult.error
            ? "Confirmed in-app alerts could not be loaded right now."
            : "No confirmed in-app alerts for this watch yet. Alerts appear only after a relationship is reconfirmed."}
          showWatchLink={false}
        />
      </section>

      <section className="cabin-snapshot" aria-labelledby="live-cabin-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Cabin comparison</p>
            <h2 id="live-cabin-heading">Current fares and their relationship.</h2>
          </div>
          <p className="section-scope">
            {currentScopeLabel ? `${currentScopeLabel} · CAD round trip` : "Awaiting first route and date scope"}
          </p>
        </div>
        <ol className="cabin-overview" aria-label="Current fares by cabin">
          {cabinOrder.filter((cabin) => watch.cabins.includes(cabin)).map((cabin) => {
            const fare = fares.get(cabin);
            const candidate = candidateByCabin.get(cabin);
            const run = candidate ? cycleRuns.get(candidate.id) : undefined;
            return (
              <li key={cabin}>
                <div className="cabin-overview-heading">
                  <span className="ladder-code" aria-hidden="true">{cabinCodes[cabin]}</span>
                  <div>
                    <h3>{cabinNames[cabin]}</h3>
                    <p>{run ? statusLabels[run.status] ?? run.status : "Not checked this cycle"}</p>
                  </div>
                </div>
                <strong className="cabin-price">{fare ? currencyFormatter.format(fare.total_price) : "—"}</strong>
                <p className="cabin-relationship">{relationshipToEconomy(cabin, fare, economyFare)}</p>
                <p className="fare-provenance">
                  {fare
                    ? `${fare.airline ?? "Airline not reported"} · ${stopsCopy(fare.stops_outbound)} · observed ${timestampFormatter.format(new Date(fare.observed_at))}`
                    : run?.status === "NO_RESULT"
                      ? "The provider returned no fare that met this watch's constraints."
                      : "No current, quality-eligible fare is available."}
                </p>
              </li>
            );
          })}
        </ol>
        <p className="baseline-note">
          Historical relationship baseline is still being built. Current differences are shown without claiming they are unusual.
        </p>
      </section>

      <section className="scan-health" aria-labelledby="health-heading">
        <div>
          <p className="eyebrow">Monitor health</p>
          <h2 id="health-heading">What the latest cycle actually checked.</h2>
        </div>
        <dl>
          <div><dt>Search completion</dt><dd>{checkedCount} of {expectedCabinSearches} cabin searches</dd></div>
          <div><dt>Provider responses</dt><dd>{[...cycleRuns.values()].filter((run) => successfulStatuses.has(run.status)).length} successful · {failedCount} failed</dd></div>
          <div><dt>Schedule</dt><dd>{overdue ? "Next scan overdue" : nextScan ? `Due ${timestampFormatter.format(new Date(nextScan))}` : "Not scheduled"}</dd></div>
        </dl>
      </section>

      <details className="scan-diagnostics">
        <summary>
          <span>Technical scan history</span>
          <small>{Math.min(runs.length, 8)} recent {runs.length === 1 ? "run" : "runs"}</small>
        </summary>
        <div className="scan-table-wrap">
          <table className="run-ledger-table">
            <caption className="sr-only">Recent provider search runs</caption>
            <thead>
              <tr>
                <th scope="col">Cabin</th>
                <th scope="col">Result</th>
                <th scope="col">Offers</th>
                <th scope="col">Latency</th>
                <th scope="col">Finished</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 8).map((run) => {
                const candidate = candidateById.get(run.candidate_id);
                return (
                  <tr key={run.id}>
                    <td>{candidate ? cabinNames[candidate.cabin] : "Unknown"}</td>
                    <td>{statusLabels[run.status] ?? run.status}</td>
                    <td>{run.result_count}</td>
                    <td>{run.latency_ms === null ? "—" : `${(run.latency_ms / 1000).toFixed(1)}s`}</td>
                    <td><time dateTime={run.finished_at}>{timestampFormatter.format(new Date(run.finished_at))}</time></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {runs.length === 0 ? <p className="ledger-empty">No search runs have been recorded yet.</p> : null}
        </div>
      </details>
    </div>
  );
}
