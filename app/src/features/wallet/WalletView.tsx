"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { marketConfig, PROTOCOL } from "@/data/markets";
import { useParity, useParityQuery } from "@/data/provider";
import type { Position } from "@/data/types";
import { stampFor } from "@/lib/currency";
import { cx, fmtNum, fmtPnl, fmtPrice, fmtUsd } from "@/lib/format";
import { ISSUE_STAGGER, spring } from "@/lib/motion";
import { useTheme } from "@/lib/theme";
import { useNow } from "@/lib/useNow";
import { Button, primaryLinkCls } from "@/components/Button";
import { CarbonCopy, CopyLine } from "@/components/CarbonCopy";
import { BlankCoupon, Coupon } from "@/components/Coupon";
import { MarginBar } from "@/components/MarginBar";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { PositionRow, RowAxis } from "@/components/PositionRow";
import { WaterfallView } from "@/components/WaterfallView";
import { WalletButton } from "@/components/WalletButton";

const isTerminal = (p: Position) => p.status === "Settled" || p.status === "Liquidated";

/** Which empty state (if any) the wallet shows. Exported for tests. */
export function walletState(list: Position[]): "empty" | "all-past" | "active" {
  if (list.length === 0) return "empty";
  return list.every(isTerminal) ? "all-past" : "active";
}

export function WalletView() {
  const positions = useParityQuery((d) => d.getPositions(), [], 15_000);
  const wallet = useParityQuery((d) => d.getWallet());
  const demo = useParityQuery((d) => d.getDemo());
  const reduce = useReducedMotion();
  const { theme } = useTheme();
  const now = useNow();
  const list = positions.value ?? [];
  const active = list.filter((p) => !isTerminal(p));
  const past = list.filter(isTerminal);
  const state = walletState(list);
  const totalPnl = active.reduce((a, p) => a + p.pnlUsd, 0);
  const pnl = fmtPnl(totalPnl);
  const axisDays = Math.max(30, ...list.map((p) => Math.max(0, (p.maturity - now) / 86_400)));

  const item = (p: Position, i: number, n: number, isPast: boolean) => (
    <motion.li
      key={p.id}
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.15 } : { ...spring, delay: Math.min(i, 6) * ISSUE_STAGGER }}
    >
      <PositionCoupon p={p} index={n} past={isPast} solana={theme === "solana"} axisDays={axisDays} />
    </motion.li>
  );

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-12">
      <section className="min-w-0 lg:col-span-8" aria-labelledby="wallet-t">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-navy pb-5">
          <div>
            <h1 id="wallet-t" className="t-display text-3xl text-navy md:text-[3rem]">Wallet</h1>
            <p className="mt-2 max-w-prose text-navy-2">
              Every locked rate is a coupon, newest on top. Stamps record what happened to it.
              {demo.value?.demoMode ? " Coupons No. 0001–0005 are demo history (demo mode)." : ""}
            </p>
          </div>
          {active.length ? (
            <div className="text-right">
              <span className="t-label block text-xs text-navy-2">Open marked PnL</span>
              <Num className="pnl-display text-3xl font-semibold leading-none md:text-4xl" tone={totalPnl < 0 ? "red" : "carbon"}>{pnl.text}</Num>
              <span className="t-label mt-1 block text-sm text-navy-2">{pnl.word}</span>
            </div>
          ) : null}
        </div>

        {!positions.value ? (
          <div className="mt-8 h-48 rounded-[10px] border-2 border-dashed border-hairline" aria-hidden />
        ) : state !== "active" ? (
          <div className="mt-8">
            <EmptyTicket />
          </div>
        ) : (
          <>
            {theme === "solana" ? <div className="mt-6"><RowAxis days={axisDays} /></div> : null}
            <ol className={cx(theme === "solana" ? "space-y-2" : "mt-8 space-y-8")}>
              <AnimatePresence initial={false}>{active.map((p, i) => item(p, i, list.length - list.indexOf(p), false))}</AnimatePresence>
            </ol>
          </>
        )}

        {past.length ? (
          <>
            <div className="mt-10 flex items-center gap-3" role="separator" aria-label="Past tickets">
              <span className="t-label text-sm text-navy-2">Past tickets</span>
              <span className="h-0 flex-1 border-t border-dashed border-navy/40" />
              <span className="t-num text-xs text-navy-2">{past.length}</span>
            </div>
            <ol className={cx("mt-5", theme === "solana" ? "space-y-2" : "space-y-8")}>
              {past.map((p, i) => item(p, i, list.length - list.indexOf(p), true))}
            </ol>
          </>
        ) : null}
      </section>

      <aside className="min-w-0 space-y-8 lg:col-span-4">
        <Panel title="Test balances" aside={<span>Devnet · no value</span>}>
          {wallet.value?.connected ? (
            <dl className="border-y-2 border-navy bg-coupon">
              {(["USDC", "USDG"] as const).map((m) => (
                <div key={m} className="flex items-baseline justify-between border-t border-hairline px-3 py-3 first:border-t-0">
                  <dt className="t-label text-sm text-navy">Test {m}</dt>
                  <dd><Num className="text-xl">{fmtNum(wallet.value!.balances[m], 2)}</Num></dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between border-t border-hairline px-3 py-3">
                <dt className="t-label text-sm text-navy">Test SOL</dt>
                <dd><Num className="text-xl">{fmtNum(wallet.value.solBalance ?? 0, 2)}</Num></dd>
              </div>
            </dl>
          ) : (
            <div className="space-y-3">
              <p className="text-navy-2">Connect the demo wallet to see balances and add margin.</p>
              <WalletButton compact />
            </div>
          )}
        </Panel>
        <CarbonCopy title="How marking works" aside="Conditions">
          <dl>
            <CopyLine label="Margin call" value={`< ${PROTOCOL.callEquity * 100}% IM`} />
            <CopyLine label="Partial close (30%)" value={`< ${PROTOCOL.liqEquity * 100}% IM ×3 marks`} />
            <CopyLine label="Liquidation penalty" value={`${PROTOCOL.liqPenaltyBps / 100}% of closed`} />
          </dl>
          <p className="mt-2 text-xs">Marks only run on fresh prices, so a closed market never liquidates anyone. Gaps beyond margin follow the loss waterfall.</p>
        </CarbonCopy>
      </aside>
    </div>
  );
}

/** Empty wallet (and "all settled"): one blank coupon and the way to fill it. */
function EmptyTicket() {
  return (
    <BlankCoupon>
      <p className="t-display text-xl text-navy">Lock next month&rsquo;s lira in about a minute</p>
      <p className="mt-1 max-w-prose text-sm text-navy-2">Five questions, then one signature. The Advisor sizes each month to what you need.</p>
      <Link href="/advisor" className={cx(primaryLinkCls, "mt-4 h-12 px-6 text-base")}>Start check-in</Link>
    </BlankCoupon>
  );
}

function PositionCoupon({ p, index, past, solana, axisDays }: { p: Position; index: number; past: boolean; solana: boolean; axisDays: number }) {
  const m = marketConfig(p.market);
  const equity = p.marginUsd + p.pnlUsd;
  const pnl = fmtPnl(p.pnlUsd);
  const lockedQuote = p.quantity * p.strike;
  const terminal = isTerminal(p);
  const status = stampFor(p.status);
  const body = (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      {terminal ? (
        <p className="text-sm text-navy-2">
          {p.status === "Settled"
            ? <>Settled at <span className="t-num text-carbon">{fmtPrice(p.markPrice, m.dp)}</span>; margin and result paid to your token account.</>
            : <>Closed by liquidation after a gap; margin went into the waterfall.</>}
        </p>
      ) : (
        <MarginBar equityUsd={equity} imUsd={p.imUsd} />
      )}
      <div className="flex items-start justify-between gap-4 sm:flex-col sm:items-end">
        <div className="sm:text-right">
          <span className="t-label block text-xs text-navy-2">{terminal ? "Result" : "Marked PnL"}</span>
          <Num className="pnl text-xl" tone={p.pnlUsd < 0 ? "red" : "carbon"}>{pnl.text}</Num>
          <span className="t-label ml-1.5 text-xs text-navy-2">{pnl.word}</span>
          {!terminal ? <span className="block text-xs text-navy-2">mark <span className="t-num">{fmtPrice(p.markPrice, m.dp)}</span></span> : null}
        </div>
        {!terminal ? <AddMargin p={p} /> : null}
      </div>
    </div>
  );
  const common = {
    index, market: p.market, side: p.side, tenorDays: p.tenorDays, strike: p.strike, notionalUsd: p.notionalUsd,
    lockedAmount: lockedQuote, maturity: p.maturity, mint: p.mint, no: p.no, status, partialPct: Math.round(p.closedFraction * 100),
    tag: p.demo ? "DEMO" : undefined, past,
  };
  return (
    <div className={cx("grid gap-4", p.waterfall && !solana && "xl:grid-cols-[minmax(0,1fr)_18rem]")}>
      {solana
        ? <PositionRow {...common} axisDays={axisDays} openedAt={p.openedAt}>{body}</PositionRow>
        : <Coupon {...common}>{body}</Coupon>}
      {p.waterfall ? <WaterfallView w={p.waterfall} mint={p.mint} no={p.no} /> : null}
    </div>
  );
}

function AddMargin({ p }: { p: Position }) {
  const { data } = useParity();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const amount = Math.max(10, Math.ceil(p.imUsd * 0.5));
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={state === "busy"}
      loadingLabel="Signing…"
      success={state === "done" ? "SENT" : null}
      error={err}
      onClick={async () => {
        setErr(null);
        setState("busy");
        try {
          await data.addMargin(p.id, amount);
          setState("done");
          setTimeout(() => setState("idle"), 1600);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Could not add margin.");
          setState("idle");
        }
      }}
    >
      Add {fmtUsd(amount, 0)} margin
    </Button>
  );
}
