"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useParity, useParityQuery } from "@/data/provider";
import { marketConfig, TROY_OUNCE_GRAMS } from "@/data/markets";
import type { LadderQuote, LadderRequest, LockResult, MarketQuote, ParityData, Position, Preflight, RungQuote } from "@/data/types";
import { isQuoteChanged } from "@/data/quoteDrift";
import { fmtCcy } from "@/lib/currency";
import { cx, fmtDate, fmtNum, fmtPrice, fmtUsd } from "@/lib/format";
import { fade, spring } from "@/lib/motion";
import { sourceLabel } from "@/lib/sourceLabel";
import { Button, secondaryLinkCls } from "@/components/Button";
import { Coupon } from "@/components/Coupon";
import { CONDITIONS_TEXT } from "@/components/ConditionsStrip";
import { Num } from "@/components/Num";
import { Stamp } from "@/components/Stamp";

export const QUOTE_VALID_MS = 60_000;
export const PREVIEW_SIG_LABEL = "preview — not on chain";

type Phase = "quote" | "repricing" | "signing" | "checking" | "issued" | "failed";

export interface TicketSheetProps {
  req: LadderRequest;
  lq: LadderQuote;
  quote: MarketQuote;
  /** the LOCK IT button's rect: the sheet grows out of it */
  anchor?: DOMRect | null;
  validForMs?: number;
  onClose: () => void;
  onIssued?: (res: LockResult, lq: LadderQuote) => void;
}

/** Gold-foil style for the metal markets (gram gold, ounce gold, ounce silver). */
export const isGoldMarket = (q: Pick<MarketQuote, "group">) => q.group === "Gold" || q.group === "Metals";

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/**
 * Order ticket: the quote you are about to sign (valid 60 s, re-priced on expiry — a stale
 * quote is never signed), then the issued ticket (LOCKED stamp, ticket No., the signature
 * drawn as a strip) or a NOT ISSUED ticket with the readable error.
 */
export function TicketSheet({ req, lq: lq0, quote: q0, anchor, validForMs = QUOTE_VALID_MS, onClose, onIssued }: TicketSheetProps) {
  const { data } = useParity();
  const { value: info } = useParityQuery((d) => (d.info ? d.info() : Promise.resolve(null)));
  const onChain = info?.kind === "chain";
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("quote");
  const [lq, setLq] = useState(lq0);
  const [quote, setQuote] = useState(q0);
  const [pf, setPf] = useState<Preflight | null>({ ok: true });
  const [quotedAt, setQuotedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  /** why the ticket was re-quoted: the 60 s ran out, or the terms moved at sign time */
  const [repriced, setRepriced] = useState<null | "expired" | "changed">(null);
  const [result, setResult] = useState<LockResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The sheet only opens on a click, so it never renders on the server.
  const [host] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.dataset.ticketSheet = "";
    return el;
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  /** one action at a time: a sign and a re-quote can never overlap, a double click signs once */
  const action = useRef<null | "sign" | "reprice">(null);

  const expiresAt = quotedAt + validForMs;
  const remainingMs = Math.max(0, expiresAt - now);
  const secs = Math.ceil(remainingMs / 1000);

  const showQuote = useCallback(async (fresh: LadderQuote, why: "expired" | "changed") => {
    const [check, markets] = await Promise.all([data.preflight(fresh), data.getMarkets()]);
    setRepriced(why);
    setLq(fresh);
    setPf(check);
    const mq = markets.find((m) => m.id === fresh.market);
    if (mq) setQuote(mq);
    const t = Date.now();
    setQuotedAt(t);
    setNow(t);
    setPhase("quote");
  }, [data]);

  const reprice = useCallback(async () => {
    if (action.current) return;
    action.current = "reprice";
    setPhase("repricing");
    setError(null);
    try {
      await showQuote(await data.quoteLadder(req), "expired");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not re-price this quote.");
      setPhase("failed");
    } finally {
      action.current = null;
    }
  }, [data, req, showQuote]);

  // Countdown clock (stops once signing starts); expiry re-prices the quote from the timer callback.
  const expiryRef = useRef(expiresAt);
  const repriceRef = useRef(reprice);
  useEffect(() => { expiryRef.current = expiresAt; repriceRef.current = reprice; });
  useEffect(() => {
    if (phase !== "quote") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= expiryRef.current && !action.current) void repriceRef.current();
    }, Math.min(250, Math.max(20, validForMs / 4)));
    return () => clearInterval(id);
  }, [phase, validForMs]);

  const seated = lq.rungs.every((r) => r.offerId);
  const canSign = phase === "quote" && remainingMs > 0 && !!pf?.ok && seated;

  const sign = async () => {
    if (action.current) return; // double click, or a re-quote already started
    if (Date.now() >= expiresAt) { void reprice(); return; } // never sign a stale quote
    if (!canSign) return;
    action.current = "sign";
    setPhase("signing");
    setError(null);
    let before: Set<string> | null = null;
    try {
      before = new Set((await data.getPositions()).map((p) => p.id));
      // The provider re-plans right before signing and refuses (QuoteChangedError) if anything differs.
      const res = await data.lockLadder(req, lq);
      setResult(res);
      setPhase("issued");
      onIssued?.(res, lq);
    } catch (e) {
      if (isQuoteChanged(e)) {
        try { await showQuote(e.fresh, "changed"); } catch { setError("The quote changed and could not be re-priced."); setPhase("failed"); }
      } else {
        const msg = e instanceof Error ? e.message : "The transaction failed.";
        if (before && mayHaveLanded(msg)) {
          setPhase("checking");
          const landed = await findLanded(data, lq, before).catch(() => []);
          if (landed.length) {
            const res = { signature: "", positions: landed };
            setResult(res);
            setPhase("issued");
            onIssued?.(res, lq);
            return;
          }
        }
        setError(msg);
        setPhase("failed");
      }
    } finally {
      action.current = null;
    }
  };

  /* ---- modal: own portal host, background inert, focus trapped and restored ---- */
  useLayoutEffect(() => {
    const el = host;
    if (!el) return;
    document.body.appendChild(el);
    const others = Array.from(document.body.children).filter((c) => c !== el && !c.hasAttribute("inert"));
    others.forEach((c) => c.setAttribute("inert", ""));
    const prev = document.activeElement as HTMLElement | null;
    return () => {
      others.forEach((c) => c.removeAttribute("inert"));
      el.remove();
      prev?.focus?.();
    };
  }, [host]);
  // Every phase change moves focus: the primary action when it can take it, else the dialog
  // (while signing / re-pricing / checking the primary is busy and disabled).
  useEffect(() => {
    if (!host) return;
    const busy = phase === "signing" || phase === "repricing" || phase === "checking";
    const target = !busy && primaryRef.current && !primaryRef.current.disabled ? primaryRef.current : dialogRef.current;
    target?.focus();
  }, [phase, host, canSign]);
  // Esc closes only while the ticket is still a quote (never mid-signature).
  useEffect(() => {
    if (phase !== "quote") return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && !action.current) { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [phase, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    );
    if (!items.length) { e.preventDefault(); dialogRef.current.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  /* ---- entrance: grow out of the LOCK IT button ---- */
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const dx = anchor && anchor.width ? (anchor.left + anchor.width / 2 - vw / 2) * 0.35 : 0;
  const dy = anchor && anchor.height ? (anchor.top + anchor.height / 2 - vh / 2) * 0.35 : 12;

  const gold = isGoldMarket(quote);
  const issued = phase === "issued";
  const failed = phase === "failed";
  // Issued: render what was actually created (positions by maturity), not the displayed quote.
  const rows = issued && result ? issuedRows(result.positions, lq) : quoteRows(lq);
  const r0 = rows[0];
  const titleId = "ticket-sheet-title";
  const busyLabel = phase === "repricing" ? "Re-pricing…" : phase === "checking" ? "Checking…" : "Signing…";

  const statusTab = issued ? (
    <span className="t-label text-sm text-navy" data-testid="ticket-status">ISSUED · {rows.length} COUPON{rows.length === 1 ? "" : "S"}</span>
  ) : failed ? (
    <span className="t-label text-sm text-red" data-testid="ticket-status">NOT ISSUED</span>
  ) : phase === "checking" ? (
    <span className="t-label text-sm text-navy" data-testid="ticket-status" role="status">Checking whether the lock landed…</span>
  ) : (
    <span className="t-label text-sm text-navy" data-testid="ticket-status">
      {repriced === "changed" ? <span className="text-red">RE-PRICED · </span> : null}
      QUOTE · VALID {Math.round(validForMs / 1000)}s ·{" "}
      <span className="t-num text-carbon" aria-hidden data-testid="ticket-countdown">
        {phase === "repricing" ? "re-pricing" : `${secs}s`}
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {phase === "repricing" ? "Re-pricing the quote." : `Quote valid for ${Math.max(10, Math.ceil(secs / 10) * 10)} seconds.`}
      </span>
    </span>
  );

  const sheet = (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <motion.div
        aria-hidden
        className="ticket-scrim absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fade}
        onClick={phase === "quote" || failed || issued ? onClose : undefined}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, x: dx, y: dy }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, x: 0, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
        transition={reduce ? fade : spring}
        className="relative max-h-[94dvh] w-full max-w-[46rem] overflow-y-auto rounded-t-[10px] border-2 border-navy bg-stock px-4 pb-4 pt-4 outline-none sm:rounded-[10px] sm:px-6 sm:pb-5"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-navy pb-3">
          <h2 id={titleId} className="panel-title t-label text-lg text-navy">
            {issued ? "Your ticket" : failed ? "Ticket not issued" : "Order ticket"}
          </h2>
          {statusTab}
        </header>

        <div className="mt-4 space-y-3">
          <div data-rung-stub="">
            <Coupon
              index={1}
              market={lq.market}
              side={lq.side}
              tenorDays={r0.tenorDays}
              strike={r0.strike}
              notionalUsd={r0.notionalUsd}
              lockedAmount={r0.lockedQuote}
              maturity={r0.maturity}
              mint={lq.mint}
              no={r0.no}
              status={issued ? "LOCKED" : failed ? "NOT ISSUED" : null}
              tag={issued ? (onChain ? "ON DEVNET" : "PREVIEW · NOT ON CHAIN") : failed ? "NOT LOCKED" : "QUOTE · NOT LOCKED"}
              stubClass={gold ? "stub-gold" : undefined}
              stubExtra={gold ? <MetalQty quote={quote} notionalUsd={r0.notionalUsd} position={r0.position} /> : undefined}
            >
              <QuoteFacts lq={lq} r={r0} quote={quote} single={rows.length === 1} />
              {issued && result ? (result.signature ? <SigStrip signature={result.signature} onChain={onChain} /> : <p className="mt-3 text-xs text-navy-2" data-testid="sig-missing">The wallet returned no signature; these coupons were found in your wallet.</p>) : null}
            </Coupon>
          </div>

          {rows.length > 1 ? (
            <ol className="space-y-1.5" aria-label="More coupons in this booklet">
              {rows.slice(1).map((r, i) => (
                <li key={r.no ?? `${r.month}-${r.tenorDays}`} data-rung-stub="">
                  <RungStub index={i + 2} r={r} lq={lq} gold={gold} no={r.no} issued={issued} />
                </li>
              ))}
            </ol>
          ) : null}

          <TotalsStub lq={lq} rows={rows} gold={gold} />

          {repriced && phase === "quote" ? (
            <p className="text-sm text-navy" role="status" data-testid="repriced-note">
              {repriced === "changed"
                ? "Re-priced: the terms moved before signing, so nothing was signed. Check the new ticket and sign again."
                : "Re-priced: the quote expired and was quoted again at today\u2019s price."}
            </p>
          ) : null}
          {phase === "quote" && pf && !pf.ok ? (
            <p className="text-sm text-red" role="alert">This quote can&apos;t be signed right now ({pf.reason.replace("-", " ")}). Go back to fix it.</p>
          ) : null}
          {phase === "quote" && !seated ? (
            <p className="text-sm text-red" role="alert">A maker stopped quoting one of these months. Go back and lock the rest.</p>
          ) : null}
          {failed && error ? (
            <p className="text-sm text-red" role="alert" data-testid="ticket-error">{error}</p>
          ) : null}
        </div>

        <footer className="mt-5 border-t-2 border-navy pt-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-start sm:justify-end">
            {issued ? (
              <>
                <Link href="/wallet" className={cx(secondaryLinkCls, "h-14")} onClick={onClose}>View in Wallet</Link>
                <Button ref={primaryRef} id="ticket-done" variant="primary" size="lg" onClick={onClose}>Done</Button>
              </>
            ) : failed ? (
              <>
                <Button variant="secondary" size="lg" onClick={onClose}>Back</Button>
                <Button ref={primaryRef} id="ticket-retry" variant="primary" size="lg" onClick={() => void reprice()}>Try again</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="lg" disabled={phase !== "quote"} onClick={onClose}>Back</Button>
                <Button
                  ref={primaryRef}
                  id="ticket-sign"
                  variant="primary"
                  size="lg"
                  loading={phase === "signing" || phase === "repricing" || phase === "checking"}
                  loadingLabel={busyLabel}
                  disabled={!canSign}
                  onClick={() => void sign()}
                >
                  Sign &amp; lock
                </Button>
              </>
            )}
          </div>
          <p className="mt-3 text-xs leading-snug text-navy-2">
            {onChain ? `One signature, ${lq.rungs.length} forward${lq.rungs.length > 1 ? "s" : ""}, signed by your wallet and sent to devnet. ` : "Preview data — mock signing, nothing is sent to devnet. "}
            {CONDITIONS_TEXT}
          </p>
        </footer>
      </motion.div>
    </div>
  );

  return host ? createPortal(sheet, host) : null;
}

/* ---------------------------------------------------------------- */

/** A ticket row: a quoted rung, or (issued) a created position with its rung's fee terms. */
type Row = RungQuote & { no?: string; position?: Position };

const byMaturity = <T extends { maturity: number }>(xs: T[]) => [...xs].sort((a, b) => a.maturity - b.maturity);

function quoteRows(lq: LadderQuote): Row[] {
  return byMaturity(lq.rungs);
}

/** Issued rows come from the positions the provider returned, sorted by maturity; No. per row is its own position's. */
export function issuedRows(positions: Position[], lq: LadderQuote): Row[] {
  const rungs = byMaturity(lq.rungs);
  return byMaturity(positions).map((p, i) => {
    const r = rungs.find((x) => x.tenorDays === p.tenorDays) ?? rungs[i] ?? rungs[0];
    return {
      ...r, tenorDays: p.tenorDays, strike: p.strike, notionalUsd: p.notionalUsd, maturity: p.maturity,
      marginUsd: p.imUsd, lockedQuote: p.quantity * p.strike, no: p.no, position: p,
    };
  });
}

/** Errors after which the transaction may still have landed (timeouts, dropped connections, unknown). */
export function mayHaveLanded(msg: string): boolean {
  if (/preflight failed|rejected|declined|cancel|insufficient|simulation failed|blockhash not found|not connected/i.test(msg)) return false;
  return true;
}

/** New positions on this market/side that were not there before signing and match a rung. */
async function findLanded(data: ParityData, lq: LadderQuote, before: Set<string>): Promise<Position[]> {
  const all = await data.getPositions();
  return all.filter((p) => !before.has(p.id) && p.market === lq.market && p.side === lq.side && lq.rungs.some((r) => r.tenorDays === p.tenorDays && Math.abs(r.notionalUsd - p.notionalUsd) < 0.01));
}

function QuoteFacts({ lq, r, quote, single }: { lq: LadderQuote; r: RungQuote; quote: MarketQuote; single: boolean }) {
  const m = marketConfig(lq.market);
  const spreadUsd = (r.notionalUsd * r.spreadBps) / 10_000;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <Fact label={`Spot today · ${quote.id}`}><Num className="text-xl">{fmtPrice(quote.spot, m.dp)}</Num></Fact>
        <span aria-hidden className="route-arrow pb-1 text-xl text-red">→</span>
        <Fact label="Locked rate (strike)"><Num className="text-xl font-semibold">{fmtPrice(r.strike, m.dp)}</Num></Fact>
      </div>
      <dl className="grid grid-cols-1 gap-x-5 text-sm @lg:grid-cols-3">
        <Line label={single ? `Margin you post (${fmtNum(lq.imPct, 0)}%)` : "Margin, this coupon"} value={fmtUsd(r.marginUsd)} />
        <Line label={`Open fee (${lq.openFeeBps} bps)`} value={fmtUsd(r.feeUsd)} />
        <Line label={`Maker spread (${fmtNum(r.spreadBps, 0)} bps, in strike)`} value={fmtUsd(spreadUsd)} />
      </dl>
      <span className="t-label inline-flex rounded-[3px] border-[1.5px] border-navy px-2 py-0.5 text-xs text-navy" data-testid="price-source">
        Price source · {sourceLabel(quote.source)}
      </span>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="t-label block text-xs text-navy-2">{label}</span>
      {children}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-hairline py-1.5 @lg:block">
      <dt className="t-label text-xs text-navy-2">{label}</dt>
      <dd className="t-num text-carbon">{value}</dd>
    </div>
  );
}

/** Gram and ounce, both: gold buyers think in grams, the feed quotes ounces. */
export function MetalQty({ quote, notionalUsd, position }: { quote: MarketQuote; notionalUsd: number; position?: Position }) {
  const qty = position ? position.quantity : notionalUsd / (quote.spot * quote.upq);
  const grams = quote.base === "GAU" ? qty : qty * TROY_OUNCE_GRAMS;
  const ounces = quote.base === "GAU" ? qty / TROY_OUNCE_GRAMS : qty;
  return (
    <div data-testid="metal-qty">
      <dt className="t-label text-xs text-navy-2">{quote.base === "XAG" ? "SILVER" : "GOLD"}</dt>
      <dd className="t-num text-sm text-navy">{fmtNum(grams, 2)} g</dd>
      <dd className="t-num text-xs text-navy">{fmtNum(ounces, 4)} oz</dd>
    </div>
  );
}

function RungStub({ index, r, lq, gold, no, issued }: { index: number; r: RungQuote; lq: LadderQuote; gold: boolean; no?: string; issued: boolean }) {
  const m = marketConfig(lq.market);
  return (
    <div className="ticket-shell" data-flat="">
      <div
        className={cx(
          "coupon grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto]",
          gold && "stub-gold",
        )}
        aria-label={`Coupon ${index}: settles ${fmtDate(r.maturity)}, ${fmtCcy(r.lockedQuote, m.quote, m.quote === "USD" ? 2 : 0)}`}
      >
        <span className="t-display text-xl text-navy">{index}</span>
        <div className="min-w-0">
          <span className="t-label block text-xs text-navy-2">SETTLES · {r.tenorDays}D</span>
          <span className="t-num text-sm text-navy">{fmtDate(r.maturity)}</span>
        </div>
        <span className="t-num hidden text-sm text-navy-2 sm:block">No. {no ?? "—"}</span>
        <div className="flex items-center gap-2 text-right">
          {issued ? <Stamp kind="LOCKED" size="sm" /> : null}
          <Num className="text-lg font-semibold">{fmtCcy(r.lockedQuote, m.quote, m.quote === "USD" ? 2 : 0)}</Num>
        </div>
      </div>
    </div>
  );
}

function TotalsStub({ lq, rows, gold }: { lq: LadderQuote; rows: Row[]; gold: boolean }) {
  const m = marketConfig(lq.market);
  const total = rows.reduce((a, r) => a + r.lockedQuote, 0);
  const notional = rows.reduce((a, r) => a + r.notionalUsd, 0);
  return (
    <div className="ticket-shell" data-flat="">
      <dl className={cx("coupon grid grid-cols-2 gap-x-4 gap-y-1 border-dashed px-3 py-2.5 sm:grid-cols-4", gold && "stub-gold")} data-testid="ticket-totals">
        <div className="col-span-2 sm:col-span-1">
          <dt className="t-label text-xs text-navy-2">Totals · {rows.length} coupon{rows.length > 1 ? "s" : ""}</dt>
          <dd><Num className="text-xl font-semibold">{fmtCcy(total, m.quote, m.quote === "USD" ? 2 : 0)}</Num></dd>
        </div>
        <TotalLine label="Notional" value={fmtUsd(notional, 0)} />
        <TotalLine label={`Margin (${fmtNum(lq.imPct, 0)}%) + fee`} value={`${fmtUsd(lq.totalMarginUsd)} + ${fmtUsd(lq.totalFeeUsd)}`} />
        <TotalLine label="To post now" value={fmtUsd(lq.requiredUsd)} strong />
      </dl>
    </div>
  );
}

function TotalLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="t-label text-xs text-navy-2">{label}</dt>
      <dd className={cx("t-num text-sm text-carbon", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Bars drawn from the signature's base58 digits: decorative, but every bar is the real signature. */
export function sigBars(sig: string): { x: number; w: number }[] {
  const out: { x: number; w: number }[] = [];
  let x = 0;
  for (const ch of sig) {
    const d = Math.max(0, B58.indexOf(ch));
    const w = 1 + (d % 3);
    out.push({ x, w });
    x += w + 1 + (Math.floor(d / 3) % 3);
  }
  return out;
}

export function SigStrip({ signature, onChain }: { signature: string; onChain: boolean }) {
  const bars = sigBars(signature);
  const width = bars.length ? bars[bars.length - 1].x + bars[bars.length - 1].w : 1;
  const short = `${signature.slice(0, 6)}…${signature.slice(-6)}`;
  const strip = (
    <svg viewBox={`0 0 ${width} 28`} preserveAspectRatio="none" className="sig-strip block h-8 w-full" aria-hidden focusable="false">
      {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={28} />)}
    </svg>
  );
  return (
    <div className="mt-3 border-t border-dashed border-navy/40 pt-3" data-testid="sig-strip">
      {strip}
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="t-num text-navy">TX {short}</span>
        {onChain ? (
          <a href={explorerTx(signature)} target="_blank" rel="noreferrer" className="t-label text-navy underline decoration-1 underline-offset-4 hover:decoration-2">
            View on Solana Explorer ↗
          </a>
        ) : (
          <span className="t-label text-navy-2" data-testid="preview-sig">{PREVIEW_SIG_LABEL}</span>
        )}
      </div>
    </div>
  );
}
