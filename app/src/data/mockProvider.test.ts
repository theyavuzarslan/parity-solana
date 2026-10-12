import { describe, expect, it } from "vitest";
import { createMockProvider } from "./mockProvider";

describe("mock provider demo flow", () => {
  it("gap → three marks → partial liquidation; ladder lock lands in positions", async () => {
    const d = createMockProvider({ offline: true, demoMode: true, connected: true, balances: { USDC: 0 } });
    await d.faucet("USDC");
    const q = await d.quoteLadder({ market: "USD/TRY", side: "short", mint: "USDC", rungs: [{ month: 1, tenorDays: 30, amount: 2000 }] });
    expect(await d.preflight(q)).toEqual({ ok: true });
    const res = await d.lockLadder({ market: "USD/TRY", side: "short", mint: "USDC", rungs: [{ month: 1, tenorDays: 30, amount: 2000 }] });
    expect(res.positions[0].no).toBe("0006");
    await d.demo.shock("USD/TRY", 12);
    await d.demo.markNow(); await d.demo.markNow();
    let e = await d.demo.liquidate();
    expect(e.effect).toMatch(/awaiting 3 fresh marks/);
    await d.demo.markNow();
    e = await d.demo.liquidate();
    expect(e.effect).toMatch(/partial|closed in full/);
    const ps = await d.getPositions();
    expect(ps.some((p) => p.status === "PartiallyLiquidated" || (p.status === "Liquidated" && p.no !== "0004"))).toBe(true);
    for (const p of ps.filter((x) => x.waterfall)) {
      const w = p.waterfall!;
      expect(w.loserMarginUsd + w.insuranceUsd + w.winnerHaircutUsd).toBeCloseTo(w.owedUsd, 2);
    }
  });
});

describe("pass 2 additions", () => {
  it("lockedByMonth buckets live positions by settlement month, per market and side", async () => {
    const d = createMockProvider({ offline: true, connected: true, balances: { USDC: 5000 } });
    expect(await d.lockedByMonth("USD/TRY", "short")).toEqual({});
    await d.lockLadder({ market: "USD/TRY", side: "short", mint: "USDC", rungs: [{ month: 1, tenorDays: 30, amount: 1000 }, { month: 3, tenorDays: 90, amount: 500 }] });
    expect(await d.lockedByMonth("USD/TRY", "short")).toEqual({ 1: 1000, 3: 500 });
    expect(await d.lockedByMonth("USD/TRY", "long")).toEqual({});
    expect(await d.lockedByMonth("EUR/TRY", "short")).toEqual({});
  });

  it("starts with demo mode off: reference prices (REF) are lockable, metals are demo (STALE), demo coupons hidden", async () => {
    const d = createMockProvider({ offline: true });
    const ms = await d.getMarkets();
    expect(ms.find((m) => m.id === "USD/TRY")!.status).toBe("REF");
    expect(ms.find((m) => m.id === "XAU/USD")!.source).toBe("demo-static");
    expect(ms.find((m) => m.id === "GAU/TRY")!.status).toBe("STALE");
    expect(await d.getPositions()).toEqual([]);
    expect(d.peek!.markets().find((m) => m.id === "USD/TRY")!.spot).toBeGreaterThan(0);
    await d.demo.setDemoMode(true);
    expect((await d.getPositions()).length).toBe(5);
  });

  it("asks for test SOL after connecting, then for tokens", async () => {
    const d = createMockProvider({ offline: true });
    await d.connect();
    const q = await d.quoteLadder({ market: "USD/TRY", side: "short", mint: "USDC", rungs: [{ month: 1, tenorDays: 30, amount: 1000 }] });
    expect(await d.preflight(q)).toEqual({ ok: false, reason: "need-sol" });
    await d.requestSol();
    expect((await d.preflight(q)).ok).toBe(false);
    await d.faucet("USDC");
    expect(await d.preflight(q)).toEqual({ ok: true });
  });
});
