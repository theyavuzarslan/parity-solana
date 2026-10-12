import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketRow } from "../MarketRow";
import { marketStatus } from "@/data/pricing";
import type { MarketQuote } from "@/data/types";

const now = 1_791_800_000;
const quote = (over: Partial<MarketQuote>): MarketQuote => ({
  id: "USD/TRY", group: "Lira", base: "USD", quote: "TRY", spot: 49.17, source: "pyth", publishTime: now,
  status: "OPEN", forwards: { 30: 50.6, 90: 53.4, 180: 57.3 }, carryPct: 35.75, im: 0.1, bestSpreadBps: 25, upq: 1 / 49.17, ...over,
});

describe("market status", () => {
  it("marks a Pyth price older than 120 s as CLOSED", () => {
    expect(marketStatus({ source: "pyth", publishTime: now - 121, nowSec: now })).toBe("CLOSED");
    expect(marketStatus({ source: "pyth", publishTime: now - 30, nowSec: now })).toBe("OPEN");
    expect(marketStatus({ source: "demo-override", publishTime: now - 9999, nowSec: now })).toBe("OPEN");
  });

  it("MarketRow says 'Market closed' when the price is stale", () => {
    const status = marketStatus({ source: "pyth", publishTime: now - 3600, nowSec: now });
    render(<table><tbody><MarketRow q={quote({ status, publishTime: now - 3600 })} /></tbody></table>);
    expect(screen.getByText("Market closed")).toBeInTheDocument();
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
  });

  it("MarketRow shows no closure note when open", () => {
    render(<table><tbody><MarketRow q={quote({})} /></tbody></table>);
    expect(screen.queryByText("Market closed")).not.toBeInTheDocument();
    expect(screen.getByText("OPEN")).toBeInTheDocument();
  });
});
