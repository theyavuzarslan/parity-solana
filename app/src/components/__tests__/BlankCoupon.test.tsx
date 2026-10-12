import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlankCoupon } from "../Coupon";

afterEach(() => { delete document.documentElement.dataset.theme; });

describe("BlankCoupon skins", () => {
  it("Ticket theme: the notched ticket", () => {
    render(<BlankCoupon index={1} label="Prints after check-in" />);
    const el = screen.getByRole("article", { name: /blank coupon: prints after check-in/i });
    expect(el.classList.contains("ticket")).toBe(true);
  });

  it("Solana theme: the empty book uses the row skin, not the ticket", () => {
    document.documentElement.dataset.theme = "solana";
    render(<BlankCoupon index={1} label="Prints after check-in" />);
    const el = screen.getByRole("article", { name: /blank coupon: prints after check-in/i });
    expect(el.classList.contains("pos-row")).toBe(true);
    expect(el.closest(".ticket-shell")).toBeNull();
  });
});
