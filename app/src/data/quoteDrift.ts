import type { LadderQuote } from "./types";

/**
 * Thrown by lockLadder(req, expected) when the terms re-planned at sign time differ from the
 * quote the user was shown. Nothing was signed; `fresh` is the new quote to show instead.
 */
export class QuoteChangedError extends Error {
  readonly fresh: LadderQuote;
  readonly drift: string;
  constructor(fresh: LadderQuote, drift: string) {
    super(`The quote changed before signing (${drift}). Nothing was signed.`);
    this.name = "QuoteChangedError";
    this.fresh = fresh;
    this.drift = drift;
  }
}

export const isQuoteChanged = (e: unknown): e is QuoteChangedError =>
  e instanceof QuoteChangedError || (typeof e === "object" && e !== null && (e as { name?: string }).name === "QuoteChangedError" && "fresh" in e);

/** Relative tolerance for derived floats only (quantity); strike, margin and fees compare exactly. */
const QTY_EPS = 1e-12;

/**
 * First difference between the displayed quote and the re-planned one, or null when the signed
 * terms equal what was shown: per rung strike (tolerance 0), quantity, margin, open fee and maker
 * fee (offer + spread), plus market, side, mint and the totals.
 */
export function quoteDrift(expected: LadderQuote, fresh: LadderQuote): string | null {
  if (expected.market !== fresh.market || expected.side !== fresh.side || expected.mint !== fresh.mint) return "market, side or mint";
  if (expected.rungs.length !== fresh.rungs.length) return "number of coupons";
  if (expected.openFeeBps !== fresh.openFeeBps) return "open fee rate";
  if (expected.imPct !== fresh.imPct) return "margin rate";
  for (let i = 0; i < expected.rungs.length; i++) {
    const a = expected.rungs[i], b = fresh.rungs[i];
    const n = `coupon ${i + 1}`;
    if (a.tenorDays !== b.tenorDays) return `${n} tenor`;
    if (a.strike !== b.strike) return `${n} strike`;
    if (a.notionalUsd !== b.notionalUsd) return `${n} notional`;
    const qa = a.strike ? a.lockedQuote / a.strike : 0, qb = b.strike ? b.lockedQuote / b.strike : 0;
    if (Math.abs(qa - qb) > QTY_EPS * Math.max(1, Math.abs(qa))) return `${n} quantity`;
    if (a.marginUsd !== b.marginUsd) return `${n} margin`;
    if (a.feeUsd !== b.feeUsd) return `${n} open fee`;
    if (a.offerId !== b.offerId || a.spreadBps !== b.spreadBps) return `${n} maker fee`;
  }
  if (expected.totalMarginUsd !== fresh.totalMarginUsd || expected.totalFeeUsd !== fresh.totalFeeUsd) return "totals";
  return null;
}

/** Throws QuoteChangedError when `expected` is given and the fresh plan drifted from it. */
export function assertSameQuote(expected: LadderQuote | undefined, fresh: LadderQuote): void {
  if (!expected) return;
  const d = quoteDrift(expected, fresh);
  if (d) throw new QuoteChangedError(fresh, d);
}
