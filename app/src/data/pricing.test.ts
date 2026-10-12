import { describe, expect, it } from "vitest";
import { createMockProvider } from "./mockProvider";
import { DEMO_SPOTS, TROY_OUNCE_GRAMS } from "./markets";
import { upqFromFeeds } from "./pricing";

const feeds = { "USD/TRY": 49.17, "EUR/USD": 1.12, "GBP/USD": 1.32, "XAU/USD": 4000, "USD/JPY": 158 };

describe("USD per quote unit (upq) for crosses", () => {
  it("EUR/TRY and GAU/TRY use 1 / USD/TRY, not 1 / the composed spot", () => {
    expect(upqFromFeeds("EUR/TRY", feeds)).toBeCloseTo(1 / 49.17, 12);
    expect(upqFromFeeds("GBP/TRY", feeds)).toBeCloseTo(1 / 49.17, 12);
    expect(upqFromFeeds("GAU/TRY", feeds)).toBeCloseTo(1 / 49.17, 12);
    // the old bug: 1 / spot would be 1 / (1.12 × 49.17) for EUR/TRY
    expect(upqFromFeeds("EUR/TRY", feeds)).not.toBeCloseTo(1 / (1.12 * 49.17), 6);
  });

  it("direct pairs: USD quote → 1, USD/XXX → 1 / feed", () => {
    expect(upqFromFeeds("EUR/USD", feeds)).toBe(1);
    expect(upqFromFeeds("USD/TRY", feeds)).toBeCloseTo(1 / 49.17, 12);
    expect(upqFromFeeds("USD/JPY", feeds)).toBeCloseTo(1 / 158, 12);
  });

  it("the mock carries upq on quotes and sizes cross ladders in base units", async () => {
    const d = createMockProvider({ offline: true, connected: true, balances: { USDC: 10_000 } });
    const ms = await d.getMarkets();
    const usdtry = DEMO_SPOTS["USD/TRY"];
    const eurtry = ms.find((m) => m.id === "EUR/TRY")!;
    const gautry = ms.find((m) => m.id === "GAU/TRY")!;
    expect(eurtry.upq).toBeCloseTo(1 / usdtry, 12);
    expect(gautry.upq).toBeCloseTo(1 / usdtry, 12);

    const eur = await d.lockLadder({ market: "EUR/TRY", side: "short", mint: "USDC", rungs: [{ month: 1, tenorDays: 30, amount: 1000 }] });
    // $1,000 of EUR/TRY = 1000 / EUR/USD euros
    expect(eur.positions[0]!.quantity).toBeCloseTo(1000 / DEMO_SPOTS["EUR/USD"], 6);
  });

  it("GAU/TRY: $1,000 buys 1000 × 31.1035 / XAU/USD grams", async () => {
    const d = createMockProvider({ offline: true, demoMode: true, connected: true, balances: { USDC: 10_000 } });
    const res = await d.lockLadder({ market: "GAU/TRY", side: "long", mint: "USDC", rungs: [{ month: 1, tenorDays: 30, amount: 1000 }] });
    expect(res.positions[0]!.quantity).toBeCloseTo((1000 * TROY_OUNCE_GRAMS) / DEMO_SPOTS["XAU/USD"], 6);
  });
});

describe("mock Dispatch shock by feed", () => {
  it("shocking USD/TRY moves every lira market, not EUR/USD", async () => {
    const d = createMockProvider({ offline: true, demoMode: true });
    const before = Object.fromEntries((await d.getMarkets()).map((m) => [m.id, m]));
    await d.demo.shock("USD/TRY", 10);
    const after = Object.fromEntries((await d.getMarkets()).map((m) => [m.id, m]));
    for (const id of ["USD/TRY", "EUR/TRY", "GBP/TRY", "GAU/TRY"]) {
      expect(after[id]!.spot / before[id]!.spot).toBeCloseTo(1.1, 9);
      expect(after[id]!.upq / before[id]!.upq).toBeCloseTo(1 / 1.1, 9);
    }
    expect(after["EUR/USD"]!.spot).toBe(before["EUR/USD"]!.spot);
    expect(Object.keys((await d.getDemo()).shocks).sort()).toEqual(["EUR/TRY", "GAU/TRY", "GBP/TRY", "USD/TRY"]);
    await d.demo.reset();
    expect((await d.getDemo()).shocks).toEqual({});
  });
});
