/**
 * All monetary amounts are stored as integer poisha (1 BDT = 100 poisha)
 * to avoid floating-point precision errors.
 */

export function bdtToPoisha(bdt: number): number {
  return Math.round(bdt * 100);
}

export function poishaToBdt(poisha: number): number {
  return poisha / 100;
}

export function formatBDT(poisha: number): string {
  const bdt = poisha / 100;
  const hasFraction = poisha % 100 !== 0;
  return `৳${bdt.toLocaleString("en-BD", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
