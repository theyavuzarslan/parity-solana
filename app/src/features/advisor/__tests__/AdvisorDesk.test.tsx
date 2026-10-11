import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ParityProvider } from "@/data/provider";
import { createMockProvider } from "@/data/mockProvider";
import { AdvisorDesk } from "../AdvisorDesk";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("persona=freelancer") }));

describe("Advisor LOCK IT preflight", () => {
  it("shows the faucet CTA when mock collateral is below the required margin + fee", async () => {
    const data = createMockProvider({ offline: true, connected: true, balances: { USDC: 0, USDG: 0 } });
    render(
      <ParityProvider data={data}>
        <AdvisorDesk />
      </ParityProvider>,
    );
    const faucet = await screen.findByRole("button", { name: /get 1,000 test usdc/i });
    expect(faucet).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lock it/i })).toBeDisabled();
    expect(screen.getByText(/needs \$[\d,.]+ test USDC/i)).toBeInTheDocument();
  });

  it("enables LOCK IT once the faucet has paid out", async () => {
    const data = createMockProvider({ offline: true, connected: true, balances: { USDC: 0, USDG: 0 } });
    render(
      <ParityProvider data={data}>
        <AdvisorDesk />
      </ParityProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /get 1,000 test usdc/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /lock it/i })).toBeEnabled());
  });

  it("asks for a wallet first when none is connected", async () => {
    const data = createMockProvider({ offline: true });
    render(
      <ParityProvider data={data}>
        <AdvisorDesk />
      </ParityProvider>,
    );
    expect(await screen.findByText(/connect a wallet to lock/i)).toBeInTheDocument();
  });
});
