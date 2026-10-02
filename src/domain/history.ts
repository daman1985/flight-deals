export type HistoricalGate = "BUILDING" | "LIMITED" | "ELIGIBLE" | "ZERO_MAD";

export type HistoricalMetric = {
  sampleCount: number;
  gate: HistoricalGate;
  median: number | null;
  mad: number | null;
  percentile: number | null;
  robustScore: number | null;
  firstSampleAt: string | null;
  lastSampleAt: string | null;
  classificationEligible: boolean;
  historicalLow: boolean;
};

export type HistoricalContext = {
  method: "fare-radar-history-v1";
  lowerPrice: HistoricalMetric;
  higherPrice: HistoricalMetric;
  spreadPct: HistoricalMetric;
  scope: {
    currency: string;
    passengers: number;
    outboundStopBucket: string;
    returnStopBucket: string;
    lowerCabin: string;
    higherCabin: string;
  };
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metricFrom(value: unknown): HistoricalMetric | null {
  const row = asRecord(value);
  const sampleCount = finiteNumber(row?.sample_count);
  const gate = stringValue(row?.gate);
  if (
    sampleCount === null
    || !Number.isInteger(sampleCount)
    || sampleCount < 0
    || !["BUILDING", "LIMITED", "ELIGIBLE", "ZERO_MAD"].includes(gate ?? "")
  ) {
    return null;
  }
  return {
    sampleCount,
    gate: gate as HistoricalGate,
    median: finiteNumber(row?.median),
    mad: finiteNumber(row?.mad),
    percentile: finiteNumber(row?.percentile),
    robustScore: finiteNumber(row?.robust_score),
    firstSampleAt: stringValue(row?.first_sample_at),
    lastSampleAt: stringValue(row?.last_sample_at),
    classificationEligible: row?.classification_eligible === true,
    historicalLow: row?.historical_low === true,
  };
}

export function historicalContextFromJson(value: unknown): HistoricalContext | null {
  const context = asRecord(value);
  if (context?.method !== "fare-radar-history-v1") return null;
  const scope = asRecord(context.scope);
  const lowerPrice = metricFrom(context.lower_price);
  const higherPrice = metricFrom(context.higher_price);
  const spreadPct = metricFrom(context.spread_pct);
  const currency = stringValue(scope?.currency);
  const passengers = finiteNumber(scope?.passengers);
  const outboundStopBucket = stringValue(scope?.outbound_stop_bucket);
  const returnStopBucket = stringValue(scope?.return_stop_bucket);
  const lowerCabin = stringValue(scope?.lower_cabin);
  const higherCabin = stringValue(scope?.higher_cabin);
  if (
    !lowerPrice
    || !higherPrice
    || !spreadPct
    || !currency
    || passengers === null
    || !Number.isInteger(passengers)
    || !outboundStopBucket
    || !returnStopBucket
    || !lowerCabin
    || !higherCabin
  ) {
    return null;
  }
  return {
    method: context.method,
    lowerPrice,
    higherPrice,
    spreadPct,
    scope: {
      currency,
      passengers,
      outboundStopBucket,
      returnStopBucket,
      lowerCabin,
      higherCabin,
    },
  };
}

export function historicalReadiness(metric: HistoricalMetric): string {
  if (metric.gate === "BUILDING") {
    return `${metric.sampleCount} of 10 comparable cycles collected`;
  }
  if (metric.gate === "LIMITED") {
    return `${metric.sampleCount} comparable cycles · context only`;
  }
  if (metric.gate === "ZERO_MAD") {
    return `${metric.sampleCount} comparable cycles · variation is too flat to classify`;
  }
  return `${metric.sampleCount} comparable cycles · historical comparison eligible`;
}
