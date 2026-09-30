import { describe, expect, it } from "vitest";

import { coverageRatio, evidenceFreshness, scanIsOverdue } from "@/domain/trust";

const now = Date.parse("2026-09-30T12:00:00Z");

describe("evidenceFreshness", () => {
  it("uses the approved live, aging, and stale thresholds", () => {
    expect(evidenceFreshness("2026-09-30T11:50:00Z", now).state).toBe("live");
    expect(evidenceFreshness("2026-09-30T11:00:00Z", now).state).toBe("aging");
    expect(evidenceFreshness("2026-09-30T08:00:00Z", now)).toMatchObject({
      state: "stale",
      label: "May have changed — last checked 4 hr ago",
    });
  });

  it("never describes missing evidence as live", () => {
    expect(evidenceFreshness(null, now)).toEqual({
      ageMinutes: null,
      label: "Awaiting first scan",
      state: "queued",
    });
  });
});

describe("scan health helpers", () => {
  it("keeps scan completion separate from fare availability", () => {
    expect(coverageRatio(3, 3)).toBe(1);
    expect(coverageRatio(2, 3)).toBeCloseTo(2 / 3);
  });

  it("identifies an overdue scheduled scan", () => {
    expect(scanIsOverdue("2026-09-30T11:00:00Z", now)).toBe(true);
    expect(scanIsOverdue("2026-09-30T13:00:00Z", now)).toBe(false);
  });
});
