import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarginBar } from "../MarginBar";

describe("MarginBar", () => {
  it("marks the call line at 50% and the liquidation line at 20% of IM", () => {
    render(<MarginBar equityUsd={80} imUsd={200} />);
    const call = screen.getByTestId("threshold-call");
    const liq = screen.getByTestId("threshold-liq");
    expect(call).toHaveAttribute("data-threshold", "0.5");
    expect(liq).toHaveAttribute("data-threshold", "0.2");
    expect(call.style.left).toBe("50%");
    expect(liq.style.left).toBe("20%");
    expect(screen.getByText(/Call 50%/)).toBeInTheDocument();
    expect(screen.getByText(/Liquidation 20%/)).toBeInTheDocument();
  });

  it("reports equity as a share of IM on the meter", () => {
    render(<MarginBar equityUsd={80} imUsd={200} />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText(/below the call line/i)).toBeInTheDocument();
  });
});
