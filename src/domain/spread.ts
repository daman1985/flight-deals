export type CabinRelationship = "INVERSION" | "SAME_PRICE" | "PREMIUM";

export type CabinSpread = {
  amount: number;
  percent: number;
  ratio: number;
  relationship: CabinRelationship;
};

/**
 * Compare a higher cabin against its lower-cabin reference.
 * Positive values are premiums; negative values are inversions.
 */
export function calculateCabinSpread(
  referencePrice: number,
  higherCabinPrice: number,
): CabinSpread {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new RangeError("referencePrice must be a finite number greater than zero");
  }

  if (!Number.isFinite(higherCabinPrice) || higherCabinPrice < 0) {
    throw new RangeError("higherCabinPrice must be a finite non-negative number");
  }

  const amount = higherCabinPrice - referencePrice;
  const ratio = higherCabinPrice / referencePrice;
  const percent = (amount / referencePrice) * 100;

  return {
    amount,
    percent,
    ratio,
    relationship:
      amount < 0 ? "INVERSION" : amount === 0 ? "SAME_PRICE" : "PREMIUM",
  };
}
