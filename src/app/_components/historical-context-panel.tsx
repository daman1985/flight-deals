import {
  historicalReadiness,
  type HistoricalContext,
  type HistoricalMetric,
} from "@/domain/history";

const cabinNames: Record<string, string> = {
  ECONOMY: "Economy",
  PREMIUM_ECONOMY: "Premium Economy",
  BUSINESS: "Business",
  FIRST: "First",
};

function stopLabel(bucket: string) {
  if (bucket === "NONSTOP") return "nonstop";
  if (bucket === "ONE_STOP") return "1 stop";
  if (bucket === "TWO_PLUS_STOPS") return "2+ stops";
  if (bucket === "ONE_WAY") return "one-way";
  return bucket.toLowerCase().replaceAll("_", " ");
}

function metricValue(metric: HistoricalMetric, suffix = "") {
  return metric.median === null ? "Not available" : `${metric.median.toFixed(1)}${suffix}`;
}

export function HistoricalContextPanel({
  context,
  currentSpreadPct,
}: {
  context: HistoricalContext;
  currentSpreadPct: number;
}) {
  const spread = context.spreadPct;
  const lowerCabin = cabinNames[context.scope.lowerCabin] ?? context.scope.lowerCabin;
  const higherCabin = cabinNames[context.scope.higherCabin] ?? context.scope.higherCabin;
  const percentile = spread.percentile;
  const lead = spread.gate === "BUILDING"
    ? `Fare Radar is still building a trustworthy history for this exact ${lowerCabin}–${higherCabin} comparison.`
    : percentile !== null
      ? `The current cabin gap sits at the ${percentile.toFixed(1)}th percentile of comparable acquisition cycles.`
      : "The route has enough observations for context, but not enough price variation for a robust ranking.";

  return (
    <section className="history-panel" aria-labelledby="history-heading">
      <div className="history-panel-intro">
        <p className="eyebrow">Historical price context</p>
        <h2 id="history-heading">What this exact comparison has done before.</h2>
        <p>{lead}</p>
      </div>
      <dl className="history-stat-list">
        <div>
          <dt>Current cabin gap</dt>
          <dd>{currentSpreadPct > 0 ? "+" : ""}{currentSpreadPct.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Historical median gap</dt>
          <dd>{metricValue(spread, "%")}</dd>
        </div>
        <div>
          <dt>Evidence gate</dt>
          <dd>{historicalReadiness(spread)}</dd>
        </div>
        <div>
          <dt>Comparable itinerary scope</dt>
          <dd>
            {stopLabel(context.scope.outboundStopBucket)} outbound · {stopLabel(context.scope.returnStopBucket)} return · {context.scope.passengers} {context.scope.passengers === 1 ? "traveler" : "travelers"} · {context.scope.currency}
          </dd>
        </div>
      </dl>
      <p className="history-panel-note">
        {spread.historicalLow
          ? "This relationship is unusually low versus its own eligible history. Reconfirmation is still required before an alert appears."
          : "Historical context supports interpretation; it does not replace freshness, scan completeness, or reconfirmation."}
      </p>
    </section>
  );
}
