import { describe, expect, it, vi } from "vitest";
import { mergeQuotes, parseHermes, parseShock, planWrites, e8, HERMES_STALE_SECS } from "../src/relay.js";
import { FEEDS, MARKETS } from "../src/markets.js";

describe("relay parseShock()", () => {
  it("parses signed percentages", () => {
    expect(parseShock("+12%")).toBeCloseTo(1.12);
    expect(parseShock("-5")).toBeCloseTo(0.95);
    expect(parseShock(" 8.5% ")).toBeCloseTo(1.085);
  });
  it("empty means no shock", () => {
    expect(parseShock(undefined)).toBe(1);
    expect(parseShock("  ")).toBe(1);
  });
  it("bad input warns and falls back to 1", () => {
    const warn = vi.fn();
    expect(parseShock("twelve", warn)).toBe(1);
    expect(parseShock("-100%", warn)).toBe(1);
    expect(parseShock("+12%%", warn)).toBe(1);
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

describe("relay Hermes parsing", () => {
  const now = 1_800_000_000;
  const entry = (id: string, price: string, expo: number, publish_time: number) =>
    ({ id: `0x${id}`, price: { price, expo, publish_time, conf: "1" } });

  it("normalises prices and warns on feeds older than the stale limit", () => {
    const warn = vi.fn();
    const q = parseHermes({ parsed: [
      entry(FEEDS.USD_TRY, "4917300000", -8, now - 5),
      entry(FEEDS.EUR_USD, "112060", -5, now - HERMES_STALE_SECS - 1),
    ] }, now, warn);
    expect(q.prices.USD_TRY).toBeCloseTo(49.173);
    expect(q.prices.EUR_USD).toBeCloseTo(1.1206);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("EUR_USD");
  });

  it("fills missing feeds from the fallback and names them", () => {
    const primary = { source: "pyth-hermes", prices: { USD_TRY: 49.1 } };
    const fallback = { source: "frankfurter-ecb", prices: { USD_TRY: 48, XAU_USD: 4000 } };
    const m = mergeQuotes(primary, fallback);
    expect(m.prices.USD_TRY).toBe(49.1);
    expect(m.prices.XAU_USD).toBe(4000);
    expect(m.source).toContain("fallback[XAU_USD]");
  });

  it("returns the primary untouched when nothing is missing", () => {
    const primary = { source: "p", prices: { USD_TRY: 1 } };
    expect(mergeQuotes(primary, { source: "f", prices: {} })).toBe(primary);
  });
});

describe("relay planWrites() (resync marker)", () => {
  const usdtry = MARKETS.filter((m) => m.symbol === "USD/TRY");
  const px = { USD_TRY: 49.17 };
  const A = e8(49.17);
  const slot = (a: bigint, set: boolean) => ({ a, b: 0n, set });
  const slots = (s: ReturnType<typeof slot>) => { const out = []; out[usdtry[0]!.id] = s; return out; };

  it("keeps a Dispatch shock while the source value is unchanged", () => {
    const sent = new Map([[usdtry[0]!.id, `${A}:0`]]);
    expect(planWrites(usdtry, px, slots(slot(e8(55), true)), sent, () => {})).toEqual([]);
  });

  it("rewrites a cleared slot even when lastSent matches (Reset demo state / demo mode off)", () => {
    const sent = new Map([[usdtry[0]!.id, `${A}:0`]]);
    const w = planWrites(usdtry, px, slots(slot(0n, false)), sent, () => {});
    expect(w).toHaveLength(1);
    expect(w[0]!.A).toBe(A);
  });

  it("rewrites when the source moves, and records an identical on-chain slot without writing", () => {
    const sent = new Map<number, string>();
    expect(planWrites(usdtry, px, slots(slot(e8(48), true)), sent, () => {})).toHaveLength(1);
    expect(planWrites(usdtry, px, slots(slot(A, true)), sent, () => {})).toEqual([]);
    expect(sent.get(usdtry[0]!.id)).toBe(`${A}:0`);
  });
});
