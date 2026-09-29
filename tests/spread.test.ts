import { describe, expect, it } from "vitest";

import { calculateCabinSpread } from "@/domain/spread";

describe("calculateCabinSpread", () => {
  it("calculates the worked premium-economy example", () => {
    const spread = calculateCabinSpread(914, 982);

    expect(spread.amount).toBe(68);
    expect(spread.percent).toBeCloseTo(7.4398, 4);
    expect(spread.ratio).toBeCloseTo(1.0744, 4);
    expect(spread.relationship).toBe("PREMIUM");
  });

  it("identifies a cabin inversion", () => {
    const spread = calculateCabinSpread(914, 873);

    expect(spread.amount).toBe(-41);
    expect(spread.percent).toBeLessThan(0);
    expect(spread.relationship).toBe("INVERSION");
  });

  it("identifies the same price", () => {
    expect(calculateCabinSpread(914, 914).relationship).toBe("SAME_PRICE");
  });

  it("rejects invalid price inputs", () => {
    expect(() => calculateCabinSpread(0, 200)).toThrow(RangeError);
    expect(() => calculateCabinSpread(100, Number.NaN)).toThrow(RangeError);
    expect(() => calculateCabinSpread(100, -1)).toThrow(RangeError);
  });
});
