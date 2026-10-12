// Single source of truth for market and rate metadata (spec §2, §3; docs/rates.md).
// Scripts, relay and keeper use it, and the app imports it later. Keep it free of
// Solana/Anchor imports so it stays usable from any runtime.

/** Pyth price feed ids (hex, no 0x), pinned from Hermes /v2/price_feeds. */
export const FEEDS = {
  USD_TRY: "032a2eba1c2635bf973e95fb62b2c0705c1be2603b9572cc8d5edeaf8744e058",
  EUR_USD: "a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
  GBP_USD: "84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1",
  USD_CHF: "0b1e3297e69f162877b577b0d6a47a0d63b2392bc8499e6540da4187a63e28f8",
  USD_JPY: "ef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52",
  USD_CNH: "eef52e09c878ad41f6a81803e3640fe04dceea727de894edd4ea117e2e332e66",
  USD_MXN: "e13b1c1ffb32f34e1be9545583f01ef385fde7f42ee66049d30570dc866b77ca",
  USD_BRL: "d2db4dbf1aea74e0f666b0e8f73b9580d407f5e5cf931940b06dc633d7a95906",
  USD_ZAR: "389d889017db82bf42141f23b61b8de938a4e2d156e36312175bebf797f493f1",
  USD_INR: "0ac0f9a2886fc2dd708bc66cc2cea359052ce89d324f45d95fadbc6c4fcf1809",
  XAU_USD: "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2",
  XAG_USD: "f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e",
} as const;
export type FeedKey = keyof typeof FEEDS;

/** Market.op: 0 = feed A only, 1 = A × B, 2 = A ÷ B. */
export const OP_NONE = 0, OP_MUL = 1, OP_DIV = 2;
/** Market.quote_conv: USD per quote unit. 0 = quote is USD, 1 = 1/feedA, 2 = 1/feedB. */
export const CONV_USD = 0, CONV_INV_FEED_A = 1, CONV_INV_FEED_B = 2;

export type MarketMeta = {
  id: number;
  symbol: string;
  /** Rate code used for the base leg. GAU/TRY uses the XAU lease rate (docs/rates.md). */
  base: string;
  quote: string;
  feedA: string;
  feedB?: string;
  /** Feed keys, for price sources that work per feed (relay). */
  feedAKey: FeedKey;
  feedBKey?: FeedKey;
  op: 0 | 1 | 2;
  scaleNum: bigint;
  scaleDen: bigint;
  quoteConv: 0 | 1 | 2;
  imBps: number;
  /** Spread the seeded maker quotes on this market (15 majors, 40 TRY/EM/metals). */
  spreadBps: number;
  /** One of the five demo markets (also seeded with USDG offers). */
  demo: boolean;
  group: "TRY" | "Major" | "EM" | "Metal";
};

const m = (
  id: number, symbol: string, base: string, quote: string,
  feedAKey: FeedKey, feedBKey: FeedKey | undefined, op: 0 | 1 | 2, quoteConv: 0 | 1 | 2,
  group: MarketMeta["group"], demo: boolean,
  scale: [bigint, bigint] = [1n, 1n],
): MarketMeta => ({
  id, symbol, base, quote,
  feedA: FEEDS[feedAKey], feedB: feedBKey ? FEEDS[feedBKey] : undefined,
  feedAKey, feedBKey, op, scaleNum: scale[0], scaleDen: scale[1], quoteConv,
  // Global constraint: IM >= 10% everywhere. TRY pairs (and gram gold) carry 12%.
  imBps: group === "TRY" ? 1200 : 1000,
  spreadBps: group === "Major" ? 15 : 40,
  demo, group,
});

/** 31.1034768 g per troy ounce: GAU/TRY = XAU/USD × USD/TRY × 1e8 / 3_110_347_680. */
const GRAM_SCALE: [bigint, bigint] = [100_000_000n, 3_110_347_680n];

export const MARKETS: MarketMeta[] = [
  m(0, "USD/TRY", "USD", "TRY", "USD_TRY", undefined, OP_NONE, CONV_INV_FEED_A, "TRY", true),
  m(1, "EUR/TRY", "EUR", "TRY", "EUR_USD", "USD_TRY", OP_MUL, CONV_INV_FEED_B, "TRY", true),
  m(2, "GBP/TRY", "GBP", "TRY", "GBP_USD", "USD_TRY", OP_MUL, CONV_INV_FEED_B, "TRY", false),
  m(3, "GAU/TRY", "XAU", "TRY", "XAU_USD", "USD_TRY", OP_MUL, CONV_INV_FEED_B, "TRY", true, GRAM_SCALE),
  m(4, "EUR/USD", "EUR", "USD", "EUR_USD", undefined, OP_NONE, CONV_USD, "Major", true),
  m(5, "GBP/USD", "GBP", "USD", "GBP_USD", undefined, OP_NONE, CONV_USD, "Major", false),
  m(6, "USD/CHF", "USD", "CHF", "USD_CHF", undefined, OP_NONE, CONV_INV_FEED_A, "Major", false),
  m(7, "USD/JPY", "USD", "JPY", "USD_JPY", undefined, OP_NONE, CONV_INV_FEED_A, "Major", false),
  m(8, "USD/CNH", "USD", "CNH", "USD_CNH", undefined, OP_NONE, CONV_INV_FEED_A, "Major", false),
  m(9, "USD/MXN", "USD", "MXN", "USD_MXN", undefined, OP_NONE, CONV_INV_FEED_A, "EM", false),
  m(10, "USD/BRL", "USD", "BRL", "USD_BRL", undefined, OP_NONE, CONV_INV_FEED_A, "EM", false),
  m(11, "USD/ZAR", "USD", "ZAR", "USD_ZAR", undefined, OP_NONE, CONV_INV_FEED_A, "EM", false),
  m(12, "USD/INR", "USD", "INR", "USD_INR", undefined, OP_NONE, CONV_INV_FEED_A, "EM", false),
  m(13, "XAU/USD", "XAU", "USD", "XAU_USD", undefined, OP_NONE, CONV_USD, "Metal", true),
  m(14, "XAG/USD", "XAG", "USD", "XAG_USD", undefined, OP_NONE, CONV_USD, "Metal", false),
];

export type RateMeta = { code: string; rateBps: number; basisDays: 360 | 365; source: string };

/** Seed values as of 2026-10-12, from docs/rates.md (sources and caveats listed there). */
export const RATES: RateMeta[] = [
  { code: "USD", rateBps: 388, basisDays: 360, source: "FOMC 16 Sep 2026 (3.75–4.00 midpoint)" },
  { code: "TRY", rateBps: 3700, basisDays: 365, source: "TCMB one-week repo" },
  { code: "EUR", rateBps: 250, basisDays: 360, source: "ECB deposit facility" },
  { code: "GBP", rateBps: 375, basisDays: 365, source: "BoE Bank Rate" },
  { code: "CHF", rateBps: 0, basisDays: 360, source: "SNB policy rate" },
  { code: "JPY", rateBps: 125, basisDays: 360, source: "BoJ call rate target" },
  { code: "CNH", rateBps: 300, basisDays: 360, source: "PBoC 1y LPR (proxy)" },
  { code: "MXN", rateBps: 650, basisDays: 360, source: "Banxico target rate" },
  { code: "BRL", rateBps: 1375, basisDays: 365, source: "BCB Selic target (252bd simplified to 365)" },
  { code: "ZAR", rateBps: 725, basisDays: 365, source: "SARB policy rate" },
  { code: "INR", rateBps: 550, basisDays: 365, source: "RBI policy repo" },
  { code: "XAU", rateBps: 50, basisDays: 360, source: "assumed gold lease rate (UNVERIFIED placeholder)" },
  { code: "XAG", rateBps: 100, basisDays: 360, source: "assumed silver lease rate (UNVERIFIED placeholder)" },
];

export const marketById = (id: number): MarketMeta => {
  const mk = MARKETS.find((x) => x.id === id);
  if (!mk) throw new Error(`unknown market ${id}`);
  return mk;
};
