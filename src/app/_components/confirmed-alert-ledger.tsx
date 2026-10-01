import Link from "next/link";

import { historicalReadiness, type HistoricalContext } from "@/domain/history";

export type ConfirmedAlertEntry = {
  alert: {
    id: string;
    created_at: string;
    sent_at: string | null;
  };
  anomaly: {
    id: string;
    origin: string;
    destination: string;
    departure_date: string;
    return_date: string | null;
    lower_cabin: string | null;
    higher_cabin: string | null;
    lower_cabin_price: number | null;
    higher_cabin_price: number | null;
    spread_amount: number | null;
    spread_pct: number | null;
    confidence: string | null;
    confirmed_at: string;
    currency: string;
    type: string;
    severity: string;
    outbound_stop_bucket: string | null;
    return_stop_bucket: string | null;
    lower_observation_id: string | null;
    higher_observation_id: string | null;
    lower_run_id: string | null;
    higher_run_id: string | null;
    historical_context: HistoricalContext | null;
  };
  watch: { id: string; name: string };
};

const cabinNames: Record<string, string> = {
  ECONOMY: "Economy",
  PREMIUM_ECONOMY: "Premium Economy",
  BUSINESS: "Business",
  FIRST: "First",
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
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Vancouver",
  timeZoneName: "short",
});
function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatClassification(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStops(bucket: string | null) {
  if (bucket === "NONSTOP") return "Nonstop";
  if (bucket === "ONE_STOP") return "1 stop";
  if (bucket === "TWO_PLUS_STOPS") return "2+ stops";
  if (bucket === "ONE_WAY") return "One-way";
  return null;
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export function ConfirmedAlertLedger({
  alerts,
  emptyMessage,
  showWatchLink = true,
}: {
  alerts: ConfirmedAlertEntry[];
  emptyMessage: string;
  showWatchLink?: boolean;
}) {
  if (alerts.length === 0) {
    return <p className="confirmed-alert-empty">{emptyMessage}</p>;
  }

  return (
    <ol className="confirmed-alert-list" aria-label="Confirmed in-app fare alerts">
      {alerts.map(({ alert, anomaly, watch }) => {
        const confirmedAt = new Date(anomaly.confirmed_at);
        const recordedAt = alert.sent_at ?? alert.created_at;
        const lowerCabin = anomaly.lower_cabin ? cabinNames[anomaly.lower_cabin] ?? anomaly.lower_cabin : "Lower cabin";
        const higherCabin = anomaly.higher_cabin ? cabinNames[anomaly.higher_cabin] ?? anomaly.higher_cabin : "Higher cabin";
        const routeDates = `${anomaly.origin} → ${anomaly.destination} · ${formatDate(anomaly.departure_date)}${anomaly.return_date ? ` – ${formatDate(anomaly.return_date)}` : " · one-way"}`;
        const outboundStops = formatStops(anomaly.outbound_stop_bucket);
        const returnStops = formatStops(anomaly.return_stop_bucket);
        const evidenceIds = [
          anomaly.lower_observation_id && `Observation ${anomaly.lower_observation_id}`,
          anomaly.higher_observation_id && `Observation ${anomaly.higher_observation_id}`,
          anomaly.lower_run_id && `Run ${anomaly.lower_run_id}`,
          anomaly.higher_run_id && `Run ${anomaly.higher_run_id}`,
        ].filter((value): value is string => Boolean(value));
        const history = anomaly.historical_context;

        return (
          <li className="confirmed-alert-row" key={alert.id}>
            <div className="confirmed-alert-main">
              <p className="confirmed-alert-route">{routeDates}</p>
              <h3>{higherCabin} relationship confirmed</h3>
              <p className="confirmed-alert-classification">
                {formatClassification(anomaly.type)} · {formatClassification(anomaly.severity)} severity
              </p>
              <p className="confirmed-alert-fares">
                {anomaly.lower_cabin_price !== null && anomaly.higher_cabin_price !== null
                  ? `${lowerCabin} ${formatCurrency(anomaly.lower_cabin_price, anomaly.currency)} · ${higherCabin} ${formatCurrency(anomaly.higher_cabin_price, anomaly.currency)}`
                  : "Confirmed cabin relationship"}
                {anomaly.spread_amount !== null
                  ? ` · ${formatCurrency(anomaly.spread_amount, anomaly.currency)}${anomaly.spread_pct !== null ? ` / ${anomaly.spread_pct > 0 ? "+" : ""}${anomaly.spread_pct.toFixed(1)}%` : ""} spread`
                  : anomaly.spread_pct !== null
                    ? ` · ${anomaly.spread_pct > 0 ? "+" : ""}${anomaly.spread_pct.toFixed(1)}% spread`
                    : ""}
              </p>
              {outboundStops || returnStops ? (
                <p className="confirmed-alert-stops">
                  {outboundStops ? `Outbound ${outboundStops}` : null}
                  {outboundStops && returnStops ? " · " : null}
                  {returnStops ? `Return ${returnStops}` : null}
                </p>
              ) : null}
              {history ? (
                <p className="confirmed-alert-history">
                  History at confirmation · {history.spreadPct.percentile !== null
                    ? `${history.spreadPct.percentile.toFixed(1)}th percentile · `
                    : ""}
                  {historicalReadiness(history.spreadPct)}
                </p>
              ) : null}
              {history ? (
                <details className="confirmed-alert-evidence">
                  <summary>Historical comparison details</summary>
                  <p>
                    Median cabin gap {history.spreadPct.median === null
                      ? "not available"
                      : `${history.spreadPct.median.toFixed(1)}%`}
                    {history.spreadPct.mad === null
                      ? ""
                      : ` · median absolute deviation ${history.spreadPct.mad.toFixed(1)} points`}
                  </p>
                </details>
              ) : null}
              {evidenceIds.length > 0 ? (
                <details className="confirmed-alert-evidence">
                  <summary>Reconfirmation evidence IDs</summary>
                  <p>{evidenceIds.join(" · ")}</p>
                </details>
              ) : null}
            </div>
            <div className="confirmed-alert-meta">
              <time dateTime={anomaly.confirmed_at} title={timestampFormatter.format(confirmedAt)}>
                Confirmed {timestampFormatter.format(confirmedAt)}
              </time>
              <time dateTime={recordedAt} title={timestampFormatter.format(new Date(recordedAt))}>
                Alert {relativeTime(recordedAt)}
              </time>
              {showWatchLink ? (
                <Link href={`/watches/${watch.id}`} aria-label={`Open ${watch.name} watch`}>
                  {watch.name} <span aria-hidden="true">→</span>
                </Link>
              ) : <span>{watch.name}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
