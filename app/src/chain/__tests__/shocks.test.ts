// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pruneShocks, type DemoSlot, type ShockedSlot } from "../shocks";

type K = "USD/TRY" | "EUR/TRY";
const slots = (m: Partial<Record<K, DemoSlot>>) => (k: K) => m[k];

describe("pruneShocks", () => {
  it("keeps a shock while its slot still holds the shocked value", () => {
    const shocks: Partial<Record<K, number>> = { "USD/TRY": 1.12 };
    const written: Partial<Record<K, ShockedSlot>> = { "USD/TRY": { a: 112n, b: 0n } };
    expect(pruneShocks(shocks, written, slots({ "USD/TRY": { a: 112n, b: 0n, set: true } }))).toEqual([]);
    expect(shocks).toEqual({ "USD/TRY": 1.12 });
  });

  it("drops a shock once the relay rewrites the slot", () => {
    const shocks: Partial<Record<K, number>> = { "USD/TRY": 1.12, "EUR/TRY": 1.12 };
    const written: Partial<Record<K, ShockedSlot>> = { "USD/TRY": { a: 112n, b: 0n }, "EUR/TRY": { a: 50n, b: 112n } };
    const dropped = pruneShocks(shocks, written, slots({
      "USD/TRY": { a: 100n, b: 0n, set: true },
      "EUR/TRY": { a: 50n, b: 112n, set: true },
    }));
    expect(dropped).toEqual(["USD/TRY"]);
    expect(shocks).toEqual({ "EUR/TRY": 1.12 });
    expect(written["USD/TRY"]).toBeUndefined();
  });

  it("drops a shock when the slot was cleared (reset, demo mode off) or is unknown", () => {
    const shocks: Partial<Record<K, number>> = { "USD/TRY": 0.95, "EUR/TRY": 1.05 };
    const written: Partial<Record<K, ShockedSlot>> = { "USD/TRY": { a: 95n, b: 0n }, "EUR/TRY": { a: 1n, b: 2n } };
    pruneShocks(shocks, written, slots({ "USD/TRY": { a: 95n, b: 0n, set: false } }));
    expect(shocks).toEqual({});
  });

  it("drops a multiplier with no recorded written value", () => {
    const shocks: Partial<Record<K, number>> = { "USD/TRY": 1.05 };
    pruneShocks(shocks, {}, slots({ "USD/TRY": { a: 1n, b: 0n, set: true } }));
    expect(shocks).toEqual({});
  });
});
