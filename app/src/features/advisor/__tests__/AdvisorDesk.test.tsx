import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ParityProvider } from "@/data/provider";
import { createMockProvider } from "@/data/mockProvider";
import { AdvisorDesk } from "../AdvisorDesk";
import { walkCheckIn } from "./walk";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("persona=freelancer") }));

const renderDesk = (data: ReturnType<typeof createMockProvider>) =>
  render(
    <ParityProvider data={data}>
      <AdvisorDesk />
    </ParityProvider>,
  );

describe("Advisor LOCK IT preflight (after the check-in)", () => {
  it("shows the faucet CTA as the primary action when mock collateral is below margin + fee", async () => {
    const user = userEvent.setup();
    renderDesk(createMockProvider({ offline: true, connected: true, balances: { USDC: 0, USDG: 0 } }));
    await walkCheckIn(user);
    const faucet = await screen.findByRole("button", { name: /get 10,000 test usdc/i });
    expect(faucet).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^lock it$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/needs \$[\d,.]+ test USDC/i)).toBeInTheDocument();
  });

  it("enables LOCK IT once the faucet has paid out", async () => {
    const user = userEvent.setup();
    renderDesk(createMockProvider({ offline: true, connected: true, balances: { USDC: 0, USDG: 0 } }));
    await walkCheckIn(user);
    await user.click(await screen.findByRole("button", { name: /get 10,000 test usdc/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^lock it$/i })).toBeEnabled());
  });

  it("asks for a wallet first when none is connected", async () => {
    const user = userEvent.setup();
    renderDesk(createMockProvider({ offline: true }));
    await walkCheckIn(user);
    expect(await screen.findByText(/connect a wallet to lock/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^connect wallet$/i })).toBeEnabled();
  });
});
