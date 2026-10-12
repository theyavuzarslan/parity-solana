import { describe, expect, it } from "vitest";
import { decide } from "../src/decide.js";

const base = { status: "Open", breachCount: 0, confirmMarks: 3, now: 1_000, maturity: 2_000 };

describe("keeper decide()", () => {
  it("matured -> settle only", () => {
    expect(decide({ ...base, now: 2_000 })).toEqual(["settle"]);
    expect(decide({ ...base, now: 9_999, breachCount: 5 })).toEqual(["settle"]);
    expect(decide({ ...base, now: 2_000, status: "PartiallyLiquidated" })).toEqual(["settle"]);
  });

  it("breach >= confirm -> mark then liquidate", () => {
    expect(decide({ ...base, breachCount: 3 })).toEqual(["mark", "liquidate"]);
    expect(decide({ ...base, breachCount: 4, status: "Called" })).toEqual(["mark", "liquidate"]);
    expect(decide({ ...base, breachCount: 1, confirmMarks: 1, status: "PartiallyLiquidated" })).toEqual(["mark", "liquidate"]);
  });

  it("healthy -> mark", () => {
    expect(decide(base)).toEqual(["mark"]);
    expect(decide({ ...base, status: "Called", breachCount: 2 })).toEqual(["mark"]);
  });

  it("closed -> nothing", () => {
    expect(decide({ ...base, status: "Settled" })).toEqual([]);
    expect(decide({ ...base, status: "Liquidated", breachCount: 9, now: 5_000 })).toEqual([]);
  });

  it("accepts Anchor enum casing", () => {
    expect(decide({ ...base, status: "partiallyLiquidated", breachCount: 3 })).toEqual(["mark", "liquidate"]);
    expect(decide({ ...base, status: "settled" })).toEqual([]);
  });
});
