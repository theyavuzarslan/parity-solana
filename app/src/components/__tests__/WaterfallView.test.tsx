import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WaterfallView } from "../WaterfallView";
import { createMockProvider } from "@/data/mockProvider";

const money = (el: HTMLElement) => Number(el.textContent!.replace(/[^0-9.]/g, ""));

describe("WaterfallView", () => {
  it("steps add up to the amount owed", () => {
    render(<WaterfallView w={{ owedUsd: 412.5, loserMarginUsd: 300, insuranceUsd: 90, winnerHaircutUsd: 22.5 }} />);
    const owed = money(screen.getByTestId("wf-owed"));
    const parts = ["wf-margin", "wf-insurance", "wf-haircut"].map((id) => money(screen.getByTestId(id)));
    expect(owed).toBe(412.5);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(owed, 2);
  });

  it("the demo VOID position's waterfall sums correctly", async () => {
    const data = createMockProvider({ offline: true, demoMode: true });
    const voided = (await data.getPositions()).find((p) => p.status === "Liquidated");
    expect(voided?.waterfall).toBeDefined();
    const w = voided!.waterfall!;
    expect(w.loserMarginUsd + w.insuranceUsd + w.winnerHaircutUsd).toBeCloseTo(w.owedUsd, 2);
  });
});
