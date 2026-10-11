import type { MarketGroup, MarketId, Rate, RateCode } from "./types";

/** Pyth price-feed ids (hex, no 0x — Hermes returns them in this form). */
export const FEEDS = {
  "USD/TRY": "032a2eba1c2635bf973e95fb62b2c0705c1be2603b9572cc8d5edeaf8744e058",
  "EUR/USD": "a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
  "GBP/USD": "84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1",
  "USD/CHF": "0b1e3297e69f162877b577b0d6a47a0d63b2392bc8499e6540da4187a63e28f8",
  "USD/JPY": "ef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52",
  "USD/CNH": "eef52e09c878ad41f6a81803e3640fe04dceea727de894edd4ea117e2e332e66",
  "USD/MXN": "e13b1c1ffb32f34e1be9545583f01ef385fde7f42ee66049d30570dc866b77ca",
  "USD/BRL": "d2db4dbf1aea74e0f666b0e8f73b9580d407f5e5cf931940b06dc633d7a95906",
  "USD/ZAR": "389d889017db82bf42141f23b61b8de938a4e2d156e36312175bebf797f493f1",
  "USD/INR": "0ac0f9a2886fc2dd708bc66cc2cea359052ce89d324f45d95fadbc6c4fcf1809",
  "XAU/USD": "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2",
  "XAG/USD": "f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e",
} as const;

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

export const MARKETS: MarketConfig[] = [
  { id: "USD/TRY", group: "Lira", base: "USD", quote: "TRY", baseRate: "USD", im: 0.1, dp: 4, compose: direct("USD/TRY"), feeds: ["USD/TRY"], label: "US dollar in lira" },
  { id: "EUR/TRY", group: "Lira", base: "EUR", quote: "TRY", baseRate: "EUR", im: 0.1, dp: 4, compose: (s) => s["EUR/USD"] * s["USD/TRY"], feeds: ["EUR/USD", "USD/TRY"], label: "Euro in lira" },
  { id: "GBP/TRY", group: "Lira", base: "GBP", quote: "TRY", baseRate: "GBP", im: 0.1, dp: 4, compose: (s) => s["GBP/USD"] * s["USD/TRY"], feeds: ["GBP/USD", "USD/TRY"], label: "Pound in lira" },
  { id: "GAU/TRY", group: "Gold", base: "GAU", quote: "TRY", baseRate: "XAU", im: 0.1, dp: 2, compose: (s) => (s["XAU/USD"] * s["USD/TRY"]) / TROY_OUNCE_GRAMS, feeds: ["XAU/USD", "USD/TRY"], label: "Gram gold in lira" },
  { id: "EUR/USD", group: "Majors", base: "EUR", quote: "USD", baseRate: "EUR", im: 0.03, dp: 5, compose: direct("EUR/USD"), feeds: ["EUR/USD"], label: "Euro in dollars" },
  { id: "GBP/USD", group: "Majors", base: "GBP", quote: "USD", baseRate: "GBP", im: 0.03, dp: 5, compose: direct("GBP/USD"), feeds: ["GBP/USD"], label: "Pound in dollars" },
  { id: "USD/CHF", group: "Majors", base: "USD", quote: "CHF", baseRate: "USD", im: 0.03, dp: 5, compose: direct("USD/CHF"), feeds: ["USD/CHF"], label: "Dollar in francs" },
  { id: "USD/JPY", group: "Majors", base: "USD", quote: "JPY", baseRate: "USD", im: 0.03, dp: 3, compose: direct("USD/JPY"), feeds: ["USD/JPY"], label: "Dollar in yen" },
  { id: "USD/CNH", group: "Trade partners", base: "USD", quote: "CNH", baseRate: "USD", im: 0.03, dp: 4, compose: direct("USD/CNH"), feeds: ["USD/CNH"], label: "Dollar in offshore yuan" },
  { id: "USD/MXN", group: "EM peers", base: "USD", quote: "MXN", baseRate: "USD", im: 0.06, dp: 4, compose: direct("USD/MXN"), feeds: ["USD/MXN"], label: "Dollar in pesos" },
  { id: "USD/BRL", group: "EM peers", base: "USD", quote: "BRL", baseRate: "USD", im: 0.06, dp: 4, compose: direct("USD/BRL"), feeds: ["USD/BRL"], label: "Dollar in reais" },
  { id: "USD/ZAR", group: "EM peers", base: "USD", quote: "ZAR", baseRate: "USD", im: 0.06, dp: 4, compose: direct("USD/ZAR"), feeds: ["USD/ZAR"], label: "Dollar in rand" },
  { id: "USD/INR", group: "EM peers", base: "USD", quote: "INR", baseRate: "USD", im: 0.06, dp: 3, compose: direct("USD/INR"), feeds: ["USD/INR"], label: "Dollar in rupees" },
  { id: "XAU/USD", group: "Metals", base: "XAU", quote: "USD", baseRate: "XAU", im: 0.06, dp: 2, compose: direct("XAU/USD"), feeds: ["XAU/USD"], label: "Gold ounce in dollars" },
  { id: "XAG/USD", group: "Metals", base: "XAG", quote: "USD", baseRate: "XAG", im: 0.06, dp: 3, compose: direct("XAG/USD"), feeds: ["XAG/USD"], label: "Silver ounce in dollars" },
];

export const GROUP_ORDER = ["Lira", "Gold", "Majors", "Trade partners", "EM peers", "Metals"] as const;

export const marketConfig = (id: MarketId): MarketConfig => {
  const m = MARKETS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown market ${id}`);
  return m;
};

export const RATE_SOURCE = "demo, to be verified";

/** Seed rate registry (13 codes). Demo values, to be verified against central-bank sources. */
export const SEED_RATES: Omit<Rate, "updatedAt">[] = [
  { code: "USD", ratePct: 4.25, basis: 360, source: RATE_SOURCE },
  { code: "TRY", ratePct: 40, basis: 365, source: RATE_SOURCE },
  { code: "EUR", ratePct: 2.0, basis: 360, source: RATE_SOURCE },
  { code: "GBP", ratePct: 4.0, basis: 365, source: RATE_SOURCE },
  { code: "CHF", ratePct: 0.0, basis: 360, source: RATE_SOURCE },
  { code: "JPY", ratePct: 0.5, basis: 360, source: RATE_SOURCE },
  { code: "CNH", ratePct: 3.0, basis: 360, source: RATE_SOURCE },
  { code: "MXN", ratePct: 7.5, basis: 360, source: RATE_SOURCE },
  { code: "BRL", ratePct: 15.0, basis: 365, source: RATE_SOURCE },
  { code: "ZAR", ratePct: 7.0, basis: 365, source: RATE_SOURCE },
  { code: "INR", ratePct: 5.5, basis: 365, source: RATE_SOURCE },
  { code: "XAU", ratePct: 0.5, basis: 360, source: "demo lease-rate proxy, to be verified" },
  { code: "XAG", ratePct: 0.5, basis: 360, source: "demo lease-rate proxy, to be verified" },
];

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
