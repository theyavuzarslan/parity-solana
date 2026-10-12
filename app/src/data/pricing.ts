import { forwardPrice } from "advisor";
import { MARKETS, marketConfig, PROTOCOL, type FeedKey } from "./markets";
import type { MarketId, MarketStatus, Rate, RateCode, Side, SpotSource } from "./types";

export function rateOf(rates: Rate[], code: RateCode): Rate {
  const r = rates.find((x) => x.code === code);
  if (!r) throw new Error(`Missing rate ${code}`);
  return r;
}

/** F = S × (1 + r_q·t/B_q) / (1 + r_b·t/B_b) — via the advisor package. */
export function forwardFor(market: MarketId, spot: number, rates: Rate[], days: number): number {
  const m = marketConfig(market);
  const rb = rateOf(rates, m.baseRate);
  const rq = rateOf(rates, m.quote);
  return forwardPrice(spot, rb.ratePct / 100, rb.basis, rq.ratePct / 100, rq.basis, days);
}

export function carryPct(market: MarketId, rates: Rate[]): number {
  const m = marketConfig(market);
  return rateOf(rates, m.quote).ratePct - rateOf(rates, m.baseRate).ratePct;
}

/** Taker long pays up the spread, taker short gives it up (spec §4). */
export function strikeFor(forward: number, side: Side, spreadBps: number): number {
  const s = spreadBps / 10_000;
  return side === "long" ? forward * (1 + s) : forward * (1 - s);
}

/**
 * USD value of one unit of the quote currency (upq), from FEED-level prices, exactly like the
 * program's Market.quote_conv: USD quote -> 1; otherwise 1 / the USD/<quote> feed. For a cross
 * such as EUR/TRY (EUR/USD × USD/TRY) or GAU/TRY that is 1 / USD/TRY, NOT 1 / the composed spot.
 */
export function upqFromFeeds(market: MarketId, feeds: Partial<Record<FeedKey, number>>): number {
  const m = MARKETS.find((x) => x.id === market);
  if (!m) throw new Error(`Unknown market ${market}`);
  const conv = m.chain.quoteConv;
  if (conv === 0) return 1;
  const v = feeds[m.feeds[conv === 1 ? 0 : 1]!];
  return v && v > 0 ? 1 / v : NaN;
}

/** USD value of one unit of the quote currency, as carried on the quote (MarketQuote.upq). */
export const usdPerQuote = (q: { upq: number }): number => q.upq;

/**
 * Status rule: demo override or relayed demo price → OPEN; ECB daily reference → REF (lockable on devnet,
 * labelled "not a live feed"); live price older than 120 s → CLOSED (FX weekends,
 * holidays); no feed at all → STALE.
 */
export function marketStatus(p: { source: SpotSource; publishTime: number; nowSec: number }): MarketStatus {
  if (p.source === "demo-override" || p.source === "relay") return "OPEN";
  if (p.source === "demo-static") return "STALE";
  if (p.source === "ecb-ref") return "REF";
  return p.nowSec - p.publishTime > PROTOCOL.maxPriceAgeSecs ? "CLOSED" : "OPEN";
}

/** Statuses that block opening or marking a position. REF is allowed (devnet, test tokens). */
export const isPaused = (s: MarketStatus) => s === "CLOSED" || s === "STALE";

/** Long PnL in USD at a mark price (NDF convention, undiscounted for the demo); upq = USD per quote unit. */
export function pnlUsd(side: Side, quantity: number, strike: number, mark: number, upq: number): number {
  const long = quantity * (mark - strike) * upq;
  return side === "long" ? long : -long;
}
