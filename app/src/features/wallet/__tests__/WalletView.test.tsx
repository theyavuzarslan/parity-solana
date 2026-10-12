import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParityProvider } from "@/data/provider";
import { createMockProvider } from "@/data/mockProvider";
import type { ParityData } from "@/data/types";
import { WalletView, walletState } from "../WalletView";

const renderWallet = (data: ParityData) => render(<ParityProvider data={data}><WalletView /></ParityProvider>);

describe("wallet empty states", () => {
  it("D1 empty wallet: one blank coupon, the one-minute promise and a Start check-in CTA", async () => {
    renderWallet(createMockProvider({ offline: true, seedDemoPositions: false }));
    expect(await screen.findByText(/lock next month.s lira in about a minute/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start check-in/i })).toHaveAttribute("href", "/advisor");
    expect(screen.getByLabelText(/blank coupon: no tickets yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/past tickets/i)).not.toBeInTheDocument();
  });

  it("D5 all settled: blank coupon on top, past tickets stamped SETTLED under a divider", async () => {
    const base = createMockProvider({ offline: true, demoMode: true });
    const data: ParityData = { ...base, getPositions: async () => (await base.getPositions()).filter((p) => p.status === "Settled") };
    renderWallet(data);
    expect(await screen.findByRole("separator", { name: /past tickets/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start check-in/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /status: settled/i })).toBeInTheDocument();
  });

  it("walletState picks the right state", () => {
    expect(walletState([])).toBe("empty");
  });
});
