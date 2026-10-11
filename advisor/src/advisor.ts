export type Direction = 'sell' | 'buy'; // sell base forward (USD earner) | buy base forward (importer/saver)
export type Risk = 'conservative' | 'balanced' | 'opportunistic';
export const GAMMA: Record<Risk, number> = { conservative: 20, balanced: 6, opportunistic: 2 };

/** Simple-interest covered interest parity; rates are decimals. */
export function forwardPrice(spot: number, rBase: number, basisBase: number, rQuote: number, basisQuote: number, days: number): number {
  return (spot * (1 + (rQuote * days) / basisQuote)) / (1 + (rBase * days) / basisBase);
}

export function expectedSpot(spot: number, driftAnnual: number, days: number): number {
  return spot * (1 + (driftAnnual * days) / 365);
}

export function hedgeRatio(p: { direction: Direction; spot: number; forward: number; expected: number; sigmaAnnual: number; days: number; risk: Risk }): number {
  const v = p.sigmaAnnual * p.sigmaAnnual * (p.days / 365);
  if (!(v > 0) || !(p.spot > 0)) return 1;
  const premium = (p.forward - p.expected) / p.spot;
  const adj = premium / (GAMMA[p.risk] * v);
  const h = p.direction === 'sell' ? 1 + adj : 1 - adj;
  return Math.min(1, Math.max(0, h));
}

const FRACTIONS = [1, 0.75, 0.5, 0.5, 0.5, 0.5];

export function ladder(p: { months: number; monthlyExposure: number; h: number }): { month: number; tenorDays: number; amount: number; fraction: number }[] {
  return FRACTIONS.slice(0, Math.max(0, p.months)).map((fraction, i) => ({
    month: i + 1,
    tenorDays: 30 * (i + 1),
    fraction,
    amount: Math.round(p.monthlyExposure * fraction * p.h * 100) / 100,
  }));
}

/** exposure in base currency (e.g. USD); results in quote currency (TRY). hedged is fully locked at strike. */
export function scenarios(p: { exposure: number; strike: number; spot: number; shocks: number[] }): { shock: number; unhedged: number; hedged: number }[] {
  return p.shocks.map((shock) => ({ shock, unhedged: p.exposure * p.spot * (1 + shock), hedged: p.exposure * p.strike }));
}

/** EWMA volatility of daily returns, annualised sqrt(var*252). */
export function ewma(returns: number[], lambda = 0.94): number {
  if (returns.length === 0) return 0;
  let v = returns[0] * returns[0];
  for (let i = 1; i < returns.length; i++) v = lambda * v + (1 - lambda) * returns[i] * returns[i];
  return Math.sqrt(v * 252);
}

export type VolEntry = { sigmaAnnual: number; driftAnnual: number; asOf: string };
