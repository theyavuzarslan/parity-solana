import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ParityProvider } from "@/data/provider";
import { createMockProvider } from "@/data/mockProvider";
import type { LadderRequest, MarketId, ParityData, ProviderInfo } from "@/data/types";
import { AdvisorDesk } from "../AdvisorDesk";
import { PREVIEW_SIG_LABEL, TicketSheet } from "../TicketSheet";
import { walkCheckIn } from "./walk";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("persona=freelancer") }));

const rungs = (n: number) => [30, 60, 90, 120, 150, 180].slice(0, n).map((tenorDays, i) => ({ month: i + 1, tenorDays, amount: 500 }));

async function setup(opts: { market?: MarketId; n?: number; chain?: boolean; validForMs?: number } = {}) {
  const mock = createMockProvider({ offline: true, connected: true, balances: { USDC: 10_000 } });
  const data: ParityData = opts.chain
    ? { ...mock, info: async () => ({ kind: "chain", cluster: "devnet", admin: null, isAdmin: false } as unknown as ProviderInfo) }
    : mock;
  const req: LadderRequest = { market: opts.market ?? "USD/TRY", side: "short", mint: "USDC", rungs: rungs(opts.n ?? 1) };
  const lq = await data.quoteLadder(req);
  const quote = (await data.getMarkets()).find((m) => m.id === req.market)!;
  const onClose = vi.fn();
  const quoteSpy = vi.spyOn(data, "quoteLadder");
  render(
    <ParityProvider data={data}>
      <TicketSheet req={req} lq={lq} quote={quote} validForMs={opts.validForMs} onClose={onClose} />
    </ParityProvider>,
  );
  return { data, onClose, quoteSpy, dialog: await screen.findByRole("dialog", { name: /order ticket/i }) };
}

describe("order ticket sheet", () => {
  it("shows the quote with spot → strike, source and a 60 s validity, focused on Sign & lock", async () => {
    const { dialog } = await setup();
    expect(within(dialog).getByTestId("ticket-status").textContent).toMatch(/QUOTE · VALID 60s/);
    expect(within(dialog).getByText(/locked rate \(strike\)/i)).toBeInTheDocument();
    expect(within(dialog).getByTestId("price-source").textContent).toMatch(/price source/i);
    expect(within(dialog).getByText(/Quote valid for 60 seconds/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign & lock/i })).toHaveFocus();
  });

  it("re-prices when the quote expires (never signs a stale quote)", async () => {
    const { quoteSpy } = await setup({ validForMs: 200 });
    expect(quoteSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(quoteSpy).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() => expect(screen.getByRole("button", { name: /sign & lock/i })).toBeInTheDocument());
  });

  it("renders a ladder as a booklet: one full ticket plus N−1 stubs (N stubs in all) and totals", async () => {
    await setup({ n: 3 });
    expect(document.querySelectorAll("[data-rung-stub]")).toHaveLength(3);
    expect(screen.getByRole("list", { name: /more coupons/i }).querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByTestId("ticket-totals").textContent).toMatch(/Totals · 3 coupons/);
  });

  it("gold markets get the gold-foil stub with grams and ounces; lira markets do not", async () => {
    await setup({ market: "GAU/TRY" });
    expect(document.querySelector(".stub-gold")).not.toBeNull();
    const qty = screen.getByTestId("metal-qty").textContent!;
    expect(qty).toMatch(/ g/);
    expect(qty).toMatch(/ oz/);
  });

  it("currency markets keep the navy/red ticket (no gold stub)", async () => {
    await setup({ market: "USD/TRY" });
    expect(document.querySelector(".stub-gold")).toBeNull();
    expect(screen.queryByTestId("metal-qty")).toBeNull();
  });

  it("preview: the issued ticket labels the fake signature and has no explorer link", async () => {
    const user = userEvent.setup();
    await setup();
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    expect(await screen.findByRole("dialog", { name: /your ticket/i })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: /status: locked/i }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("preview-sig").textContent).toBe(PREVIEW_SIG_LABEL);
    expect(screen.queryByRole("link", { name: /solana explorer/i })).toBeNull();
    expect(screen.getByRole("link", { name: /view in wallet/i })).toHaveAttribute("href", "/wallet");
  });

  it("on chain: the issued ticket links the signature to the devnet explorer", async () => {
    const user = userEvent.setup();
    await setup({ chain: true });
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    const link = await screen.findByRole("link", { name: /solana explorer/i });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/explorer\.solana\.com\/tx\/[1-9A-HJ-NP-Za-km-z]+\?cluster=devnet$/);
    expect(screen.queryByTestId("preview-sig")).toBeNull();
  });

  it("failure: NOT ISSUED with the readable error and Try again", async () => {
    const user = userEvent.setup();
    const { data } = await setup();
    vi.spyOn(data, "lockLadder").mockRejectedValueOnce(new Error("Wallet rejected the request."));
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    expect(await screen.findByTestId("ticket-error")).toHaveTextContent("Wallet rejected the request.");
    expect(screen.getByRole("status", { name: /status: not issued/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("button", { name: /sign & lock/i })).toBeInTheDocument();
  });

  it("Esc closes the sheet before signing", async () => {
    const user = userEvent.setup();
    const { onClose } = await setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Advisor → LOCK IT opens the ticket", () => {
  it("LOCK IT opens the quote ticket; Sign & lock issues it", async () => {
    const user = userEvent.setup();
    render(
      <ParityProvider data={createMockProvider({ offline: true, connected: true, balances: { USDC: 10_000 } })}>
        <AdvisorDesk />
      </ParityProvider>,
    );
    await walkCheckIn(user);
    const lockIt = await screen.findByRole("button", { name: /^lock it$/i });
    await waitFor(() => expect(lockIt).toBeEnabled());
    await user.click(lockIt);
    const dialog = await screen.findByRole("dialog", { name: /order ticket/i });
    expect(document.querySelectorAll("[data-rung-stub]").length).toBeGreaterThanOrEqual(1);
    await user.click(within(dialog).getByRole("button", { name: /sign & lock/i }));
    expect(await screen.findByRole("dialog", { name: /your ticket/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^done$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: /your next settlements/i })).toBeInTheDocument();
  });
});
