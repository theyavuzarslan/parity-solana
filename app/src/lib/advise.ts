import { effectiveSigma, expectedSpot, hedgeRatio, ladder, scenarios, SIGMA_FLOOR, VOL, type Direction, type Risk } from "advisor";
import type { MarketId, MarketQuote, Rate } from "@/data/types";
import { forwardFor } from "@/data/pricing";

export interface Advice {
  market: MarketId;
  direction: Direction;
  horizonDays: number;
  spot: number;
  forward: number;
  /** forward premium over the horizon, % */
  carryPct: number;
  /** annual rate gap, % */
  rateGapPct: number;
  expected: number;
  driftPct: number;
  sigmaRealised: number;
  sigmaUsed: number;
  sigmaFloored: boolean;
  volSource: string;
  volAsOf: string;
  h: number;
  why: string;
  rungs: { month: number; tenorDays: number; amount: number; fraction: number }[];
}

export const SHOCKS = [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];

export function advise(p: {
  quote: MarketQuote; rates: Rate[]; direction: Direction; monthlyUsd: number; months: number; risk: Risk; override?: number | null;
}): Advice {
  const { quote, rates, direction, months, risk } = p;
  const horizonDays = 30 * months;
  const spot = quote.spot;
  const forward = forwardFor(quote.id, spot, rates, horizonDays);
  const vol = VOL[quote.id] ?? { sigmaAnnual: SIGMA_FLOOR, driftAnnual: 0, asOf: "n/a", source: "none" };
  const expected = expectedSpot(spot, vol.driftAnnual, horizonDays);
  const sigmaUsed = effectiveSigma(vol.sigmaAnnual);
  const hAdvised = hedgeRatio({ direction, spot, forward, expected, sigmaAnnual: vol.sigmaAnnual, days: horizonDays, risk });
  const h = p.override ?? hAdvised;
  const premium = ((forward - expected) / spot) * 100;
  const fwdAbove = forward >= expected;
  let why: string;
  if (direction === "sell") {
    why = fwdAbove
      ? `The forward sits ${premium.toFixed(1)}% above the rate you'd expect from recent drift, so locking pays you the rate gap — hedge ${h >= 0.995 ? "fully" : "most of it"}.`
      : `The forward sits ${Math.abs(premium).toFixed(1)}% below the expected rate, so locking costs you something; the ratio trades that cost against risk.`;
  } else {
    why = fwdAbove
      ? `The forward costs ${premium.toFixed(1)}% more than the rate you'd expect from recent drift — the lira's high rate makes locking expensive for you, so the Advisor hedges ${h <= 0.005 ? "nothing" : "less"}.`
      : `The forward is ${Math.abs(premium).toFixed(1)}% below the expected rate, so locking is cheap insurance — hedge more.`;
  }
  if (p.override != null) why = `You overrode the Advisor (it suggested ${Math.round(hAdvised * 100)}%). ` + why;
  return {
    market: quote.id, direction, horizonDays, spot, forward,
    carryPct: (forward / spot - 1) * 100,
    rateGapPct: quote.carryPct,
    expected, driftPct: vol.driftAnnual * 100,
    sigmaRealised: vol.sigmaAnnual, sigmaUsed, sigmaFloored: sigmaUsed > vol.sigmaAnnual,
    volSource: vol.source ?? "unknown", volAsOf: vol.asOf,
    h, why,
    rungs: ladder({ months, monthlyExposure: p.monthlyUsd, h }).filter((r) => r.amount > 0),
  };
}

/**
 * Quote-currency outcome of the whole programme across spot shocks:
 * unhedged = all units at the shocked spot; hedged = locked units at the
 * strike plus the unlocked remainder at the shocked spot.
 */
export function scenarioSeries(p: { totalUnits: number; hedgedUnits: number; spot: number; strike: number }) {
  const all = scenarios({ exposure: p.totalUnits, strike: p.strike, spot: p.spot, shocks: SHOCKS });
  const locked = scenarios({ exposure: p.hedgedUnits, strike: p.strike, spot: p.spot, shocks: SHOCKS });
  const open = scenarios({ exposure: p.totalUnits - p.hedgedUnits, strike: p.strike, spot: p.spot, shocks: SHOCKS });
  return all.map((r, i) => ({ shock: r.shock, unhedged: r.unhedged, hedged: locked[i].hedged + open[i].unhedged }));
}
