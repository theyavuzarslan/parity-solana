import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ParityProvider } from "@/data/provider";
import { createMockProvider } from "@/data/mockProvider";
import { MarketRow } from "@/components/MarketRow";
import type { MarketQuote, Offer } from "@/data/types";
import { AdvisorDesk } from "../AdvisorDesk";
import { walkCheckIn } from "./walk";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

const renderDesk = (data: ReturnType<typeof createMockProvider>) =>
  render(<ParityProvider data={data}><AdvisorDesk /></ParityProvider>);

describe("advisor empty states", () => {
  it("D2 no offer for a rung: NO SEATS coupon with its two actions; LOCK IT still works for the others", async () => {
    // one maker who quotes USD/TRY only out to 150 days
    const offers: Offer[] = [{ id: "o1", market: "USD/TRY", maker: "Demo maker A", makerSide: "long", spreadBps: 25, minTenorDays: 1, maxTenorDays: 150, capacityUsd: 50_000, mint: "USDC", demo: true }];
    const user = userEvent.setup();
    renderDesk(createMockProvider({ offline: true, connected: true, balances: { USDC: 10_000 }, offers }));
    await walkCheckIn(user, { months: /^6 months/i });
    expect(await screen.findByText(/no maker is quoting USD\/TRY for 180 days right now/i)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /status: no seats/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try 90 days/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lock the rest without this month/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /^lock it$/i })).toBeEnabled());
  });

  it("D3 market closed: LOCK IT disabled with the paused message and the last price time", async () => {
    const user = userEvent.setup();
    renderDesk(createMockProvider({ offline: true, connected: true, balances: { USDC: 10_000 }, forceStatus: { "USD/TRY": "CLOSED" } }));
    await walkCheckIn(user);
    expect(await screen.findByText(/prices are paused — rates can't be locked on a stale price/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^lock it$/i })).toBeDisabled();
    expect(screen.getByText(/09 OCT 12:15 UTC/)).toBeInTheDocument();
  });

  it("D3 markets row: CLOSED with the reopening time", () => {
    const q: MarketQuote = { id: "USD/TRY", group: "Lira", base: "USD", quote: "TRY", spot: 49.17, source: "pyth", publishTime: 1_791_800_000, status: "CLOSED", forwards: { 30: 50.6, 90: 53.4, 180: 57.3 }, carryPct: 35.75, im: 0.1, bestSpreadBps: 25, upq: 1 / 49.17 };
    render(<table><tbody><MarketRow q={q} /></tbody></table>);
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
    expect(screen.getByText(/FX reopens Sunday 22:00 UTC/)).toBeInTheDocument();
  });

  it("D4 not connected: the receipt becomes a 3-step checklist and the primary button is the current step", async () => {
    const user = userEvent.setup();
    renderDesk(createMockProvider({ offline: true }));
    await walkCheckIn(user);
    const list = await screen.findByRole("list", { name: /before you can lock/i });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([expect.stringMatching(/connect wallet/i), expect.stringMatching(/get test sol/i), expect.stringMatching(/get test usdc/i)]);
    expect(items[0]).toHaveAttribute("aria-current", "step");
    await user.click(screen.getByRole("button", { name: /^connect wallet$/i }));
    await waitFor(() => expect(within(screen.getByRole("list", { name: /before you can lock/i })).getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step"));
    expect(screen.getByRole("button", { name: /^get test sol$/i })).toBeEnabled();
  });
});
