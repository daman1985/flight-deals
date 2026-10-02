export const LIVE_LIMIT_MINUTES = 15;
export const STALE_LIMIT_MINUTES = 180;

export type FreshnessState = "queued" | "live" | "aging" | "stale";

export type Freshness = {
  ageMinutes: number | null;
  label: string;
  state: FreshnessState;
};

function ageCopy(minutes: number) {
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;

  return `${Math.round(hours / 24)} days ago`;
}

export function evidenceFreshness(
  checkedAt: string | null,
  nowMs = Date.now(),
): Freshness {
  if (!checkedAt) {
    return {
      ageMinutes: null,
      label: "Awaiting first scan",
      state: "queued",
    };
  }

  const checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(checkedAtMs)) {
    return {
      ageMinutes: null,
      label: "Scan time unavailable",
      state: "queued",
    };
  }

  const ageMinutes = Math.max(0, Math.round((nowMs - checkedAtMs) / 60_000));
  const age = ageCopy(ageMinutes);

  if (ageMinutes <= LIVE_LIMIT_MINUTES) {
    return { ageMinutes, label: `Checked ${age}`, state: "live" };
  }

  if (ageMinutes <= STALE_LIMIT_MINUTES) {
    return { ageMinutes, label: `Checked ${age}`, state: "aging" };
  }

  return {
    ageMinutes,
    label: `May have changed — last checked ${age}`,
    state: "stale",
  };
}

export function scanIsOverdue(nextScanAt: string | null, nowMs = Date.now()) {
  if (!nextScanAt) return false;
  const nextScanMs = Date.parse(nextScanAt);
  return Number.isFinite(nextScanMs) && nextScanMs < nowMs;
}

export function coverageRatio(checkedCount: number, candidateCount: number) {
  if (candidateCount <= 0) return 0;
  return Math.max(0, Math.min(1, checkedCount / candidateCount));
}
