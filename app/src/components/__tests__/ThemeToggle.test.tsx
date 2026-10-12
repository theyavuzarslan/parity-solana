import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "../ThemeToggle";
import { THEME_BOOT, THEME_KEY } from "@/lib/themeBoot";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme toggle", () => {
  it("defaults to Ticket, switches to Solana and persists the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: "Ticket" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Solana" }));
    expect(localStorage.getItem(THEME_KEY)).toBe("solana");
    expect(document.documentElement.dataset.theme).toBe("solana");
    unmount();

    // a fresh page load: the boot script restores the theme before React renders
    delete document.documentElement.dataset.theme;
    new Function(THEME_BOOT)();
    expect(document.documentElement.dataset.theme).toBe("solana");
    render(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: "Solana" })).toHaveAttribute("aria-checked", "true");
  });
});
