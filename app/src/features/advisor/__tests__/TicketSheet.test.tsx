import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ParityProvider } from "@/data/provider";
import { createMockProvider } from "@/data/mockProvider";
import type { LadderQuote, LadderRequest, LockResult, MarketId, ParityData, Position, ProviderInfo } from "@/data/types";
import { QuoteChangedError, quoteDrift } from "@/data/quoteDrift";
import { AdvisorDesk } from "../AdvisorDesk";
import { issuedRows, matchLanded, PREVIEW_SIG_LABEL, TicketSheet } from "../TicketSheet";
import { walkCheckIn } from "./walk";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("persona=freelancer") }));

const rungs = (n: number) => [30, 60, 90, 120, 150, 180].slice(0, n).map((tenorDays, i) => ({ month: i + 1, tenorDays, amount: 500 }));

async function setup(opts: { market?: MarketId; n?: number; chain?: boolean; validForMs?: number; tamper?: (lq: LadderQuote) => LadderQuote } = {}) {
  const mock = createMockProvider({ offline: true, connected: true, balances: { USDC: 10_000 } });
  const data: ParityData = opts.chain
    ? { ...mock, info: async () => ({ kind: "chain", cluster: "devnet", admin: null, isAdmin: false } as unknown as ProviderInfo) }
    : mock;
  const req: LadderRequest = { market: opts.market ?? "USD/TRY", side: "short", mint: "USDC", rungs: rungs(opts.n ?? 1) };
  const quoted = await data.quoteLadder(req);
  const lq = opts.tamper ? opts.tamper(quoted) : quoted;
  const quote = (await data.getMarkets()).find((m) => m.id === req.market)!;
  const onClose = vi.fn();
  const quoteSpy = vi.spyOn(data, "quoteLadder");
  const lockSpy = vi.spyOn(data, "lockLadder");
  render(
    <ParityProvider data={data}>
      <TicketSheet req={req} lq={lq} quote={quote} validForMs={opts.validForMs} onClose={onClose} />
    </ParityProvider>,
  );
  return { data, req, lq, onClose, quoteSpy, lockSpy, dialog: await screen.findByRole("dialog", { name: /order ticket/i }) };
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

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};
const bump = (lq: LadderQuote): LadderQuote => ({ ...lq, rungs: lq.rungs.map((r, i) => (i === 0 ? { ...r, strike: r.strike + 0.0001 } : r)) });

describe("signed terms = displayed terms", () => {
  it("quoteDrift: identical quotes match; any strike change (tolerance 0) is drift", async () => {
    const d = createMockProvider({ offline: true, connected: true, balances: { USDC: 10_000 } });
    const req: LadderRequest = { market: "USD/TRY", side: "short", mint: "USDC", rungs: rungs(2) };
    const a = await d.quoteLadder(req);
    expect(quoteDrift(a, await d.quoteLadder(req))).toBeNull();
    expect(quoteDrift(a, bump(a))).toMatch(/coupon 1 strike/);
    expect(quoteDrift(a, { ...a, rungs: a.rungs.map((r) => ({ ...r, feeUsd: r.feeUsd + 0.01 })) })).toMatch(/open fee/);
    expect(quoteDrift(a, { ...a, rungs: a.rungs.map((r) => ({ ...r, marginUsd: r.marginUsd + 0.01 })) })).toMatch(/margin/);
    expect(quoteDrift(a, { ...a, rungs: a.rungs.map((r) => ({ ...r, spreadBps: r.spreadBps + 1 })) })).toMatch(/maker fee/);
  });

  it("mock lockLadder(req, expected) refuses drifted terms with QuoteChangedError and creates nothing", async () => {
    const d = createMockProvider({ offline: true, connected: true, balances: { USDC: 10_000 } });
    const req: LadderRequest = { market: "USD/TRY", side: "short", mint: "USDC", rungs: rungs(1) };
    const shown = bump(await d.quoteLadder(req));
    const n0 = (await d.getPositions()).length;
    const err = await d.lockLadder(req, shown).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QuoteChangedError);
    expect((err as QuoteChangedError).fresh.rungs[0].strike).not.toBe(shown.rungs[0].strike);
    expect((await d.getPositions()).length).toBe(n0);
    await expect(d.lockLadder(req, await d.quoteLadder(req))).resolves.toHaveProperty("signature");
  });

  it("drift at sign time: nothing is signed, the ticket shows the fresh quote as RE-PRICED; signing again issues it", async () => {
    const user = userEvent.setup();
    const { data, lockSpy } = await setup({ tamper: bump });
    const n0 = (await data.getPositions()).length;
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    expect(await screen.findByTestId("repriced-note")).toHaveTextContent(/nothing was signed/i);
    expect(screen.getByTestId("ticket-status")).toHaveTextContent(/RE-PRICED/);
    expect((await data.getPositions()).length).toBe(n0);
    expect(screen.queryByRole("dialog", { name: /your ticket/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    expect(await screen.findByRole("dialog", { name: /your ticket/i })).toBeInTheDocument();
    expect(lockSpy).toHaveBeenCalledTimes(2);
    expect((await data.getPositions()).length).toBe(n0 + 1);
  });

  it("passes the displayed quote to lockLadder", async () => {
    const user = userEvent.setup();
    const { lockSpy, lq, req } = await setup();
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    await screen.findByRole("dialog", { name: /your ticket/i });
    expect(lockSpy).toHaveBeenCalledWith(req, lq);
  });
});

describe("one action at a time", () => {
  it("double click signs once", async () => {
    const user = userEvent.setup();
    const { lockSpy } = await setup();
    await user.dblClick(screen.getByRole("button", { name: /sign & lock/i }));
    await screen.findByRole("dialog", { name: /your ticket/i });
    expect(lockSpy).toHaveBeenCalledTimes(1);
  });

  it("re-quote already started at expiry: a click on Sign does not sign", async () => {
    const { data, quoteSpy, lockSpy } = await setup({ validForMs: 150 });
    const gate = deferred<LadderQuote>();
    const real = data.quoteLadder.bind(data);
    quoteSpy.mockImplementationOnce(async (r) => { const q = await real(r); await gate.promise; return q; });
    await waitFor(() => expect(quoteSpy).toHaveBeenCalled(), { timeout: 2000 });
    fireEvent.click(document.getElementById("ticket-sign")!);
    expect(lockSpy).not.toHaveBeenCalled();
    gate.resolve(undefined as unknown as LadderQuote);
    await waitFor(() => expect(screen.getByRole("button", { name: /sign & lock/i })).toBeEnabled());
    expect(lockSpy).not.toHaveBeenCalled();
  });

  it("signing in progress at expiry: no re-quote starts", async () => {
    const user = userEvent.setup();
    const { quoteSpy, lockSpy, data } = await setup({ validForMs: 300 });
    const n0 = (await data.getPositions()).length;
    const gate = deferred<void>();
    const real = data.lockLadder.bind(data);
    lockSpy.mockImplementationOnce(async (r, e) => { await gate.promise; return real(r, e); });
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    await new Promise((r) => setTimeout(r, 600));
    expect(quoteSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveFocus();
    gate.resolve();
    expect(await screen.findByRole("dialog", { name: /your ticket/i })).toBeInTheDocument();
    expect((await data.getPositions()).length).toBe(n0 + 1);
  });

  it("Esc still closes after a re-quote", async () => {
    const user = userEvent.setup();
    const { quoteSpy, onClose } = await setup({ validForMs: 200 });
    await waitFor(() => expect(quoteSpy).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() => expect(screen.getByRole("button", { name: /sign & lock/i })).toBeEnabled());
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc does nothing while signing", async () => {
    const user = userEvent.setup();
    const { lockSpy, onClose } = await setup();
    const gate = deferred<LockResult>();
    lockSpy.mockImplementationOnce(() => gate.promise);
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the page behind the sheet is inert while it is open", async () => {
    await setup();
    const others = Array.from(document.body.children).filter((c) => !c.hasAttribute("data-ticket-sheet"));
    expect(others.length).toBeGreaterThan(0);
    for (const c of others) expect(c.hasAttribute("inert")).toBe(true);
  });
});

describe("issued ticket and unknown failures", () => {
  it("issued rows follow the returned positions by maturity, each with its own No.", () => {
    const lq = { market: "USD/TRY", side: "short", mint: "USDC", rungs: [30, 60].map((t, i) => ({ month: i + 1, tenorDays: t, amount: 100, forward: 1, strike: 50 + i, notionalUsd: 100, marginUsd: 10, feeUsd: 0.1, spreadBps: 25, offerId: "o", maturity: 1000 + t, lockedQuote: 1 })), totalMarginUsd: 20, totalFeeUsd: 0.2, requiredUsd: 20.2, openFeeBps: 10, imPct: 10 } as LadderQuote;
    const pos = (no: string, tenorDays: number, strike: number) => ({ id: no, no, market: "USD/TRY", side: "short", notionalUsd: 100, quantity: 2, strike, openedAt: 1, maturity: 1000 + tenorDays, tenorDays, mint: "USDC", status: "Open", imUsd: 10, marginUsd: 10, pnlUsd: 0, closedFraction: 0, markPrice: 1, demo: true }) as Position;
    const rows = issuedRows([pos("0008", 60, 51.5), pos("0007", 30, 50.5)], lq);
    expect(rows.map((r) => r.no)).toEqual(["0007", "0008"]);
    expect(rows.map((r) => r.strike)).toEqual([50.5, 51.5]);
    expect(rows[0].lockedQuote).toBe(2 * 50.5);
  });

  it("booklet stubs carry the No. of their own position", async () => {
    const user = userEvent.setup();
    await setup({ n: 3 });
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    await screen.findByRole("dialog", { name: /your ticket/i });
    const stubs = within(screen.getByRole("list", { name: /more coupons/i })).getAllByRole("listitem");
    const nos = stubs.map((li) => li.textContent!.match(/No\. (\d{4})/)?.[1]);
    expect(nos.every(Boolean)).toBe(true);
    expect(new Set(nos).size).toBe(2);
  });

  it("an unknown failure checks whether the lock landed before offering Try again", async () => {
    const user = userEvent.setup();
    const { data, lockSpy } = await setup();
    const real = data.lockLadder.bind(data);
    lockSpy.mockImplementationOnce(async (r, e) => { await real(r, e); throw new Error("Transaction was not confirmed in 30 seconds."); });
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    expect(await screen.findByRole("dialog", { name: /your ticket/i })).toBeInTheDocument();
    expect(screen.getByTestId("sig-missing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("a known failure (wallet rejected) goes straight to NOT ISSUED", async () => {
    const user = userEvent.setup();
    const { lockSpy } = await setup();
    lockSpy.mockRejectedValueOnce(new Error("User rejected the request."));
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    expect(await screen.findByRole("button", { name: /try again/i })).toHaveFocus();
  });
});

describe("did the lock land?", () => {
  const lq2 = { market: "USD/TRY", side: "short", mint: "USDC", rungs: [30, 60].map((t, i) => ({ month: i + 1, tenorDays: t, amount: 100, forward: 1, strike: 50 + i, notionalUsd: 100, marginUsd: 10, feeUsd: 0.1, spreadBps: 25, offerId: "o", maturity: 1_000_000 + t * 86_400, lockedQuote: 1 })), totalMarginUsd: 20, totalFeeUsd: 0.2, requiredUsd: 20.2, openFeeBps: 10, imPct: 10 } as LadderQuote;
  const pos = (id: string, tenorDays: number, strike: number, extra: Partial<Position> = {}) => ({ id, no: id, market: "USD/TRY", side: "short", notionalUsd: 100, quantity: 2, strike, openedAt: 1, maturity: 1_000_000 + tenorDays * 86_400, tenorDays, mint: "USDC", status: "Open", imUsd: 10, marginUsd: 10, pnlUsd: 0, closedFraction: 0, markPrice: 1, demo: true, ...extra }) as Position;

  it("matchLanded needs a one-to-one match for every rung", () => {
    expect(matchLanded(lq2, [pos("b", 60, 51), pos("x", 90, 52), pos("a", 30, 50)])?.map((p) => p.id)).toEqual(["a", "b"]);
    expect(matchLanded(lq2, [pos("a", 30, 50)])).toBeNull(); // one rung missing
    expect(matchLanded(lq2, [pos("a", 30, 50), pos("b", 60, 51 * (1 + 1e-5))])).toBeNull(); // strike off
    expect(matchLanded(lq2, [pos("a", 30, 50), pos("b", 60, 51, { maturity: 1_000_000 + 62 * 86_400 })])).toBeNull(); // maturity off by 2 days
    expect(matchLanded(lq2, [pos("a", 30, 50), pos("b", 60, 51, { mint: "USDG" })])).toBeNull();
    expect(matchLanded(lq2, [pos("a", 30, 50), pos("b", 60, 51, { side: "long" })])).toBeNull();
    expect(matchLanded(lq2, [pos("a", 30, 50), pos("b", 60, 51, { notionalUsd: 100.5 })])).toBeNull();
  });

  it("reads positions fresh right before signing and after an unknown failure", async () => {
    const user = userEvent.setup();
    const { data, lockSpy } = await setup();
    const getSpy = vi.spyOn(data, "getPositions");
    lockSpy.mockRejectedValueOnce(new Error("Transaction was not confirmed in 30 seconds."));
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    await screen.findByRole("button", { name: /try again/i });
    expect(getSpy).toHaveBeenCalledTimes(2);
    for (const c of getSpy.mock.calls) expect(c[0]).toEqual({ fresh: true });
  });

  it("an unrelated new position does not count as landed: NOT ISSUED with the may-still-confirm copy", async () => {
    const user = userEvent.setup();
    const { data, lockSpy, req } = await setup();
    // while our attempt times out, a different ladder (90 days) lands on the same market and side
    const other = { ...req, rungs: [{ month: 3, tenorDays: 90, amount: 500 }] };
    lockSpy.mockImplementationOnce(async () => { await data.lockLadder(other); throw new Error("Transaction was not confirmed in 30 seconds."); });
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    expect(await screen.findByTestId("ticket-error")).toHaveTextContent(/not confirmed/);
    expect(screen.getByTestId("maybe-pending")).toHaveTextContent(/previous attempt may still confirm — check Wallet before signing again/);
    expect((await data.getPositions()).some((p) => p.tenorDays === 90)).toBe(true); // the unrelated lock did land
  });

  it("a late landing is found before signing again: shown as issued, no second lock", async () => {
    const user = userEvent.setup();
    const { data, lockSpy, req, lq } = await setup();
    lockSpy.mockRejectedValueOnce(new Error("Transaction was not confirmed in 30 seconds."));
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    await screen.findByRole("button", { name: /try again/i });
    const n0 = (await data.getPositions()).length;
    await data.lockLadder(req, lq); // the first attempt confirms late
    await user.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /sign & lock/i })).toBeEnabled());
    expect(screen.getByTestId("maybe-pending")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /sign & lock/i }));
    expect(await screen.findByRole("dialog", { name: /your ticket/i })).toBeInTheDocument();
    expect((await data.getPositions()).length).toBe(n0 + 1);
    expect(screen.getByTestId("sig-missing")).toBeInTheDocument();
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
