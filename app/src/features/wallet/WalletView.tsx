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
import { Button } from "@/components/Button";
import { CarbonCopy, CopyLine } from "@/components/CarbonCopy";
import { Coupon } from "@/components/Coupon";
import { MarginBar } from "@/components/MarginBar";
import { Num } from "@/components/Num";
import { Orb } from "@/components/Orb";
import { Panel } from "@/components/Panel";
import { WaterfallView } from "@/components/WaterfallView";
import { WalletButton } from "@/components/WalletButton";

export function WalletView() {
  const positions = useParityQuery((d) => d.getPositions(), [], 15_000);
  const wallet = useParityQuery((d) => d.getWallet());
  const reduce = useReducedMotion();
  const list = positions.value ?? [];
  const live = list.filter((p) => p.status !== "Settled" && p.status !== "Liquidated");
  const totalPnl = live.reduce((a, p) => a + p.pnlUsd, 0);
  const pnl = fmtPnl(totalPnl);

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-12">
      <section className="min-w-0 lg:col-span-8" aria-labelledby="wallet-t">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="wallet-t" className="t-display text-3xl text-navy md:text-[3rem]">Wallet</h1>
            <p className="mt-2 max-w-prose text-navy-2">Every locked rate is a coupon, newest on top. Stamps record what happened to it. Coupons No. 0001–0005 are demo history.</p>
          </div>
          <div className="text-right">
            <span className="t-label block text-xs text-navy-2">Open marked PnL</span>
            <Num className="text-2xl">{positions.value ? pnl.text : "—"}</Num>
            {positions.value ? <span className="t-label ml-2 text-sm text-navy-2">{pnl.word}</span> : null}
          </div>
        </div>

        {positions.loading && !list.length ? (
          <div className="mt-10 flex items-center gap-3"><Orb label="Loading positions" size={32} /><span className="t-label text-sm text-navy-2">Reading positions…</span></div>
        ) : list.length === 0 ? (
          <div className="mt-10 rounded-[10px] border-2 border-dashed border-navy/40 px-6 py-10">
            <p className="t-display text-2xl text-navy">No coupons yet</p>
            <p className="mt-2 text-navy-2">Ask the Advisor for a ladder and lock it; the coupons land here.</p>
            <Link href="/advisor" className="t-label mt-4 inline-flex rounded-[4px] border-2 border-navy px-4 py-2 text-sm hover:bg-navy hover:text-coupon">Open the Advisor</Link>
          </div>
        ) : (
          <ol className="mt-8 space-y-8">
            <AnimatePresence initial={false}>
              {list.map((p, i) => (
                <motion.li
                  key={p.id}
                  layout={!reduce}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduce ? { duration: 0.15 } : { ...spring, delay: Math.min(i, 6) * ISSUE_STAGGER }}
                >
                  <PositionCoupon p={p} index={list.length - i} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
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
            </dl>
          ) : (
            <div className="space-y-3">
              <p className="text-navy-2">Connect the demo wallet to see balances and add margin.</p>
              <WalletButton compact />
            </div>
          )}
        </Panel>
        <CarbonCopy title="How marking works" aside="CONDITIONS">
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

function PositionCoupon({ p, index }: { p: Position; index: number }) {
  const m = marketConfig(p.market);
  const equity = p.marginUsd + p.pnlUsd;
  const pnl = fmtPnl(p.pnlUsd);
  const lockedQuote = p.quantity * p.strike;
  const terminal = p.status === "Settled" || p.status === "Liquidated";
  return (
    <div className={cx("grid gap-4", p.waterfall && "xl:grid-cols-[minmax(0,1fr)_18rem]")}>
      <Coupon
        index={index}
        market={p.market}
        side={p.side}
        tenorDays={p.tenorDays}
        strike={p.strike}
        notionalUsd={p.notionalUsd}
        lockedAmount={lockedQuote}
        maturity={p.maturity}
        mint={p.mint}
        no={p.no}
        status={stampFor(p.status)}
        partialPct={Math.round(p.closedFraction * 100)}
        tag={p.demo ? "DEMO" : undefined}
      >
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
              <Num className="text-xl" tone={p.pnlUsd < 0 ? "red" : "carbon"}>{pnl.text}</Num>
              <span className="t-label ml-1.5 text-xs text-navy-2">{pnl.word}</span>
              {!terminal ? <span className="block text-xs text-navy-2">mark <span className="t-num">{fmtPrice(p.markPrice, m.dp)}</span></span> : null}
            </div>
            {!terminal ? <AddMargin p={p} /> : null}
          </div>
        </div>
      </Coupon>
      {p.waterfall ? <WaterfallView w={p.waterfall} mint={p.mint} /> : null}
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
