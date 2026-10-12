import { FEEDS as SHARED_FEEDS, MARKETS as SHARED_MARKETS, RATES as SHARED_RATES, type MarketMeta } from "shared/src/markets";
import type { MarketGroup, MarketId, Rate, RateCode } from "./types";

/**
 * Pyth price-feed ids (hex, no 0x — Hermes returns them in this form), keyed "USD/TRY" style.
 * Derived from shared/src/markets.ts, the single source for the app, scripts, relay and keeper.
 */
export const FEEDS = Object.fromEntries(
  Object.entries(SHARED_FEEDS).map(([k, id]) => [k.replace("_", "/"), id]),
) as { readonly [K in keyof typeof SHARED_FEEDS as K extends `${infer A}_${infer B}` ? `${A}/${B}` : never]: string };

export type FeedKey = keyof typeof FEEDS;

/**
 * Seed spots, available synchronously so the first paint never waits on the network.
 * FX: ECB reference rates of 9 Oct 2026 (via Frankfurter; USD/CNH uses CNY as a proxy),
 * shown as REF until a fresher reference or a live feed overlays them.
 * Metals: round demo placeholders, not market prices — always labelled "demo".
 */
export const DEMO_SPOTS: Record<FeedKey, number> = {
  "USD/TRY": 49.173,
  "EUR/USD": 1.1206,
  "GBP/USD": 1.322,
  "USD/CHF": 0.83107,
  "USD/JPY": 158.25,
  "USD/CNH": 6.6921,
  "USD/MXN": 18.2001,
  "USD/BRL": 5.005,
  "USD/ZAR": 16.5331,
  "USD/INR": 96.73,
  "XAU/USD": 4000,
  "XAG/USD": 48,
};

/** Date of the seeded ECB reference rates (ECB publishes around 14:15 CET). */
export const SEED_REF_DATE = "2026-10-09";

/** Feeds the free reference source cannot supply; they stay demo placeholders without a Pyth key. */
export const DEMO_ONLY_FEEDS: FeedKey[] = ["XAU/USD", "XAG/USD"];

/** Unix seconds for an ECB reference date (fixing ≈ 14:15 CET ≈ 12:15 UTC). */
export const refDateToSec = (date: string): number => Math.floor(Date.parse(`${date}T12:15:00Z`) / 1000);

export const TROY_OUNCE_GRAMS = 31.1034768;

export interface MarketConfig {
  id: MarketId;
  group: MarketGroup;
  base: RateCode | "GAU";
  quote: RateCode;
  /** rate code for the base leg (GAU uses the XAU lease rate) */
  baseRate: RateCode;
  im: number;
  /** decimals shown for prices */
  dp: number;
  compose: (s: Record<FeedKey, number>) => number;
  feeds: FeedKey[];
  label: string;
}

const direct = (k: FeedKey) => (s: Record<FeedKey, number>) => s[k];

const UI_MARKETS: Omit<MarketConfig, "im" | "baseRate" | "feeds">[] = [
  { id: "USD/TRY", group: "Lira", base: "USD", quote: "TRY", dp: 4, compose: direct("USD/TRY"), label: "US dollar in lira" },
  { id: "EUR/TRY", group: "Lira", base: "EUR", quote: "TRY", dp: 4, compose: (s) => s["EUR/USD"] * s["USD/TRY"], label: "Euro in lira" },
  { id: "GBP/TRY", group: "Lira", base: "GBP", quote: "TRY", dp: 4, compose: (s) => s["GBP/USD"] * s["USD/TRY"], label: "Pound in lira" },
  { id: "GAU/TRY", group: "Gold", base: "GAU", quote: "TRY", dp: 2, compose: (s) => (s["XAU/USD"] * s["USD/TRY"]) / TROY_OUNCE_GRAMS, label: "Gram gold in lira" },
  { id: "EUR/USD", group: "Majors", base: "EUR", quote: "USD", dp: 5, compose: direct("EUR/USD"), label: "Euro in dollars" },
  { id: "GBP/USD", group: "Majors", base: "GBP", quote: "USD", dp: 5, compose: direct("GBP/USD"), label: "Pound in dollars" },
  { id: "USD/CHF", group: "Majors", base: "USD", quote: "CHF", dp: 5, compose: direct("USD/CHF"), label: "Dollar in francs" },
  { id: "USD/JPY", group: "Majors", base: "USD", quote: "JPY", dp: 3, compose: direct("USD/JPY"), label: "Dollar in yen" },
  { id: "USD/CNH", group: "Trade partners", base: "USD", quote: "CNH", dp: 4, compose: direct("USD/CNH"), label: "Dollar in offshore yuan" },
  { id: "USD/MXN", group: "EM peers", base: "USD", quote: "MXN", dp: 4, compose: direct("USD/MXN"), label: "Dollar in pesos" },
  { id: "USD/BRL", group: "EM peers", base: "USD", quote: "BRL", dp: 4, compose: direct("USD/BRL"), label: "Dollar in reais" },
  { id: "USD/ZAR", group: "EM peers", base: "USD", quote: "ZAR", dp: 4, compose: direct("USD/ZAR"), label: "Dollar in rand" },
  { id: "USD/INR", group: "EM peers", base: "USD", quote: "INR", dp: 3, compose: direct("USD/INR"), label: "Dollar in rupees" },
  { id: "XAU/USD", group: "Metals", base: "XAU", quote: "USD", dp: 2, compose: direct("XAU/USD"), label: "Gold ounce in dollars" },
  { id: "XAG/USD", group: "Metals", base: "XAG", quote: "USD", dp: 3, compose: direct("XAG/USD"), label: "Silver ounce in dollars" },
];

/** Chain metadata (id, IM, base rate code, feeds) from the shared list; UI fields stay here. */
export const MARKETS: (MarketConfig & { chain: MarketMeta })[] = UI_MARKETS.map((m) => {
  const chain = SHARED_MARKETS.find((x) => x.symbol === m.id);
  if (!chain) throw new Error(`market ${m.id} missing from shared/src/markets.ts`);
  const feeds = [chain.feedAKey, chain.feedBKey].filter(Boolean).map((k) => k!.replace("_", "/") as FeedKey);
  return { ...m, im: chain.imBps / 10_000, baseRate: chain.base as RateCode, feeds, chain };
});

export const GROUP_ORDER = ["Lira", "Gold", "Majors", "Trade partners", "EM peers", "Metals"] as const;

export const marketConfig = (id: MarketId): MarketConfig => {
  const m = MARKETS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown market ${id}`);
  return m;
};

export const RATE_SOURCE = "demo, to be verified";

/** Seed rate registry (13 codes) from shared/src/markets.ts (the values deploy seeds on chain). */
export const SEED_RATES: Omit<Rate, "updatedAt">[] = SHARED_RATES.map((r) => ({
  code: r.code as RateCode,
  ratePct: r.rateBps / 100,
  basis: r.basisDays,
  source: r.code === "XAU" || r.code === "XAG" ? "demo lease-rate proxy, to be verified" : RATE_SOURCE,
}));

/** Protocol constants mirrored from the spec (§5). */
export const PROTOCOL = {
  openFeeBps: 10,
  callEquity: 0.5,
  liqEquity: 0.2,
  partialLiq: 0.3,
  liqPenaltyBps: 100,
  maxPriceAgeSecs: 120,
  minNotionalUsd: 10,
} as const;
