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
