"use client";

import type { ReactNode } from "react";
import { marketConfig } from "@/data/markets";
import { fmtCcy, sideWord } from "@/lib/currency";
import { cx, fmtDate, fmtPrice, fmtUsd } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import type { CouponProps } from "./Coupon";
import { Num } from "./Num";

const DAY = 86_400;

/**
 * Solana skin of a coupon: a stacked position row with a progress line from
 * today to the settlement date on a shared time axis. The Solana gradient is
 * used only on the active rung's line (and on the primary Lock button).
 */
export function PositionRow(p: CouponProps & { axisDays: number; openedAt: number; active?: boolean; children?: ReactNode }) {
  const m = marketConfig(p.market);
  const nowSec = useNow();
  const daysLeft = Math.max(0, (p.maturity - nowSec) / DAY);
  const terminal = p.status === "SETTLED" || p.status === "VOID";
  const width = terminal ? 0 : Math.min(100, (daysLeft / Math.max(1, p.axisDays)) * 100);
  const struck = p.status === "VOID" || p.status === "NO SEATS";
  return (
    <article
      className={cx("pos-row rounded-[8px] border border-hairline bg-coupon px-3 py-3 sm:px-4", (p.past || p.status === "NO SEATS") && "opacity-70")}
      aria-label={`Position ${p.index}: ${sideWord(p.market, p.side)} on ${p.market}, ${p.tenorDays} days, strike ${fmtPrice(p.strike, m.dp)}${p.status ? `, ${p.status}` : ""}`}
    >
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
        <span className="t-num flex size-7 items-center justify-center rounded-[6px] border border-hairline text-sm text-navy-2">{p.index}</span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-navy">{p.market}</span>
            <span className="text-navy-2">{sideWord(p.market, p.side).toLowerCase()}</span>
            <span className="text-navy-2">· {p.tenorDays}d</span>
            {p.no ? <span className="t-num text-xs text-navy-2">#{p.no}</span> : null}
          </p>
          <p className="text-xs text-navy-2">
            strike <span className="t-num text-navy">{fmtPrice(p.strike, m.dp)}</span> · {fmtUsd(p.notionalUsd, 0)} {p.mint}
          </p>
        </div>
        <div className="text-right">
          <Num tone="navy" className={cx("text-base font-medium sm:text-lg", struck && "line-through opacity-70")}>
            {fmtCcy(p.lockedAmount, m.quote, m.quote === "USD" ? 2 : 0)}
          </Num>
          {p.status ? <StatusPill status={p.status} pct={p.partialPct} /> : <span className="block text-xs text-navy-2">quote</span>}
        </div>
        {/* progress line: today → settlement, on the shared axis */}
        <div className="col-span-2 col-start-2 mt-1.5">
          <div className="relative h-1 rounded-full bg-hairline" aria-hidden>
            {width > 0 ? (
              <span className={cx("absolute inset-y-0 left-0 rounded-full", p.active ? "sol-gradient" : "bg-navy-2")} style={{ width: `${width}%` }} />
            ) : null}
          </div>
          <p className="mt-1 flex justify-between text-xs text-navy-2">
            <span>{terminal ? (p.status === "SETTLED" ? "settled" : "closed") : "today"}</span>
            <span className="t-num">{p.status === "SETTLED" ? "settled " : "settles "}{fmtDate(p.maturity).toLowerCase()}</span>
          </p>
        </div>
      </div>
      {p.children ? <div className="mt-2 border-t border-hairline pt-2 sm:ml-[2.5rem]">{p.children}</div> : null}
    </article>
  );
}

/** Flat status word for the Solana skin (no rubber-stamp texture). */
export function StatusPill({ status, pct }: { status: NonNullable<CouponProps["status"]>; pct?: number }) {
  const label = status === "PARTIAL" ? `partial ${pct ?? 30}%` : status.toLowerCase();
  const tone =
    status === "VOID" || status === "MARGIN CALL" || status === "PARTIAL" ? "border-red/60 text-red"
    : status === "LOCKED" ? "border-navy/40 text-navy"
    : "border-hairline text-navy-2";
  return (
    <span role="status" className={cx("mt-0.5 inline-flex h-5 items-center rounded-full border px-2 text-xs", tone)}>
      {label}
    </span>
  );
}

/** Axis labels above stacked rows: today on the left, the furthest settlement on the right. */
export function RowAxis({ days }: { days: number }) {
  return (
    <div className="mb-2 flex justify-between pl-[calc(1.75rem+0.75rem+0.75rem)] pr-3 text-xs text-navy-2 sm:pr-4" aria-hidden>
      <span>today</span>
      <span className="t-num">+{Math.round(days)} days</span>
    </div>
  );
}
