import type { MarketId, Position, PositionStatus, Side } from "@/data/types";
import { marketConfig } from "@/data/markets";
import type { StampKind } from "@/components/Stamp";
import { fmtNum } from "./format";

const SYMBOL: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€", GBP: "£", JPY: "¥" };

export function fmtCcy(amount: number, ccy: string, dp = 0): string {
  const s = SYMBOL[ccy];
  return s ? `${s}${fmtNum(amount, dp)}` : `${fmtNum(amount, dp)} ${ccy}`;
}

/** Route on the coupon: what you give → what you lock in. A seller of USD/TRY routes USD → TRY. */
export function routeOf(market: MarketId, side: Side): [string, string] {
  const m = marketConfig(market);
  return side === "short" ? [m.base, m.quote] : [m.quote, m.base];
}

export function stampFor(status: PositionStatus): StampKind | null {
  switch (status) {
    case "Open": return "LOCKED";
    case "Called": return "MARGIN CALL";
    case "PartiallyLiquidated": return "PARTIAL";
    case "Liquidated": return "VOID";
    case "Settled": return "SETTLED";
  }
}

export const sideWord = (market: MarketId, side: Side) => {
  const m = marketConfig(market);
  return side === "short" ? `SELL ${m.base}` : `BUY ${m.base}`;
};

export type { Position };
