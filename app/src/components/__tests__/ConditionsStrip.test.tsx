import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConditionsStrip, CONDITIONS_TEXT } from "../ConditionsStrip";

const LEGAL =
  "Conditions of contract: Proposed design · Solana devnet · test tokens only · not offered to anyone, including Turkish residents, pending legal advice. Hedge calculator, not financial advice.";

describe("ConditionsStrip", () => {
  it("renders the exact legal text from DESIGN.md §5", () => {
    render(<ConditionsStrip demoMode={false} />);
    expect(CONDITIONS_TEXT).toBe(LEGAL);
    expect(screen.getByText(LEGAL)).toBeInTheDocument();
  });

  it("shows the DEMO MODE chip only when demo mode is on", () => {
    const { rerender } = render(<ConditionsStrip demoMode={false} />);
    expect(screen.queryByText("DEMO MODE")).not.toBeInTheDocument();
    rerender(<ConditionsStrip demoMode />);
    expect(screen.getByText("DEMO MODE")).toBeInTheDocument();
  });
});
