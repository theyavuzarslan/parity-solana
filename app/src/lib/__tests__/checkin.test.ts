import { describe, expect, it } from "vitest";
import { ladder } from "advisor";
import {
  checkInToLadderInputs, EMPTY_ANSWERS, firstOpenStep, monthName, netLocked, summarySentence, whySentence, type Answers,
} from "../checkin";

const full: Answers = { profile: "freelancer", pairIdx: 0, incomeUsd: 3000, needTry: 60_000, months: 3, feel: "manageable" };

describe("check-in step flow → ladder inputs", () => {
  it("walks the steps in order and returns null until every step is answered", () => {
    let a: Answers = { ...EMPTY_ANSWERS };
    expect(firstOpenStep(a)).toBe(1);
    a = { ...a, profile: "freelancer" };
    expect(firstOpenStep(a)).toBe(2);
    a = { ...a, incomeUsd: 3000 };
    expect(firstOpenStep(a)).toBe(3);
    a = { ...a, needTry: 60_000 };
    expect(firstOpenStep(a)).toBe(4);
    a = { ...a, months: 3 };
    expect(firstOpenStep(a)).toBe(5);
    expect(checkInToLadderInputs(a, { usdTry: 50 })).toBeNull();
    a = { ...a, feel: "manageable" };
    expect(firstOpenStep(a)).toBe(6);
    expect(checkInToLadderInputs(a, { usdTry: 50 })).not.toBeNull();
  });

  it("maps answers to persona, pair, horizon and risk; caps exposure at the lira need", () => {
    const i = checkInToLadderInputs(full, { usdTry: 50 })!;
    expect(i.persona.id).toBe("freelancer");
    expect(i.pair.market).toBe("USD/TRY");
    expect(i.pair.direction).toBe("sell");
    expect(i.months).toBe(3);
    expect(i.risk).toBe("balanced");
    // ₺60,000 / 50 = $1,200 < $3,000 income → capped
    expect(i.monthlyUsd).toBe(1200);
    expect(i.capped).toBe(true);
  });

  it("does not cap when income is below the need, and maps comfort to the advisor's risk keys", () => {
    const i = checkInToLadderInputs({ ...full, incomeUsd: 500, feel: "painful" }, { usdTry: 50 })!;
    expect(i.monthlyUsd).toBe(500);
    expect(i.capped).toBe(false);
    expect(i.risk).toBe("conservative");
    expect(checkInToLadderInputs({ ...full, feel: "chance" }, { usdTry: 50 })!.risk).toBe("opportunistic");
  });

  it("importer → USD/TRY buy as the primary pair; USD/CNH stays the secondary option", () => {
    const i = checkInToLadderInputs({ ...full, profile: "importer" }, { usdTry: 50 })!;
    expect(i.pair.market).toBe("USD/TRY");
    expect(i.pair.direction).toBe("buy");
    expect(checkInToLadderInputs({ ...full, profile: "importer", pairIdx: 1 }, { usdTry: 50 })!.pair.market).toBe("USD/CNH");
  });

  it("saver is the proposed gram-gold product", () => {
    const i = checkInToLadderInputs({ ...full, profile: "saver" }, { usdTry: 50 })!;
    expect(i.pair.market).toBe("GAU/TRY");
    expect(i.persona.proposed).toBe(true);
  });
});

describe("netting already-locked amounts", () => {
  it("subtracts what is already locked per month and never goes negative", () => {
    const advised = ladder({ months: 3, monthlyExposure: 1200, h: 1 }); // 1200, 900, 600
    const planned = netLocked(advised, { 1: 1000, 3: 900 }, 1200);
    expect(planned.map((r) => r.amount)).toEqual([200, 900, 0]);
    expect(planned.map((r) => r.lockedUsd)).toEqual([1000, 0, 900]);
    expect(planned[0].share).toBeCloseTo(200 / 1200, 6);
  });

  it("says so when every known month is already covered", () => {
    const planned = netLocked(ladder({ months: 1, monthlyExposure: 1000, h: 1 }), { 1: 1000 }, 1000);
    expect(whySentence({ rungs: planned, nowSec: 0, direction: "sell", forwardAboveExpected: true, market: "USD/TRY" })).toMatch(/already covered/);
  });
});

describe("summary and why sentences", () => {
  it("names the settlement months and the reason", () => {
    const now = Date.UTC(2026, 9, 12) / 1000; // 12 Oct 2026
    const planned = netLocked(ladder({ months: 3, monthlyExposure: 1000, h: 1 }), {}, 1000);
    expect(monthName(now, 30)).toBe("November");
    expect(whySentence({ rungs: planned, nowSec: now, direction: "sell", forwardAboveExpected: true, market: "USD/TRY" }))
      .toBe("Lock 100% of November, 75% of December and 50% of January because the lira's high interest rate works in your favour.");
  });

  it("summarises the answers with what is already locked", () => {
    expect(summarySentence({ persona: "freelancer", incomeUsd: 3000, needTry: 60_000, lockedQuote: 0, quoteCcy: "TRY" }))
      .toBe("You earn ~$3,000/month and need ~₺60,000. Already locked: ₺0.");
  });
});
