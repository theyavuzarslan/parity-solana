"use client";

import type { ReactNode } from "react";
import type { MarketId, Mint, Side } from "@/data/types";
import { marketConfig } from "@/data/markets";
import { cx, fmtDate, fmtPrice, fmtUsd } from "@/lib/format";
import { fmtCcy, routeOf, sideWord } from "@/lib/currency";
import { Num } from "./Num";
import { Stamp, type StampKind } from "./Stamp";

export interface CouponProps {
  index: number;
  market: MarketId;
  side: Side;
  tenorDays: number;
  strike: number;
  notionalUsd: number;
  /** locked amount in the quote currency (e.g. TRY) */
  lockedAmount: number;
  /** unix seconds */
  maturity: number;
  mint: Mint;
  no?: string;
  status?: StampKind | null;
  partialPct?: number;
  /** small caps note on the stub, e.g. "DEMO" or "QUOTE" */
  tag?: string;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}

/**
 * A locked rate as a coupon: tabbed head, route row, departure (settlement
 * date), carbon-struck amount, perforated stub, status stamp.
 */
export function Coupon(p: CouponProps) {
  const m = marketConfig(p.market);
  const [from, to] = routeOf(p.market, p.side);
  const voided = p.status === "VOID";
  const lockedLabel = voided ? `LOCK VOIDED · ${m.quote}` : p.status === "SETTLED" ? `${p.side === "short" ? "RECEIVED" : "PAID"} ${m.quote}` : p.side === "short" ? `YOU RECEIVE ${m.quote}` : `YOU PAY ${m.quote}`;
  return (
    <article
      className={cx("coupon @container", p.className)}
      aria-label={`Coupon ${p.index}: ${sideWord(p.market, p.side)} on ${p.market}, ${p.tenorDays} days, strike ${fmtPrice(p.strike, m.dp)}`}
    >
      {/* Head: index block + tabs + red tenor tab */}
      <div className="flex items-stretch border-b-2 border-navy">
        <div className="t-display flex w-11 shrink-0 items-center justify-center bg-navy text-2xl text-coupon @md:w-14 @md:text-3xl">{p.index}</div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-2 @md:px-4">
          <span className="t-label text-sm text-navy">{p.market}</span>
          <span className="t-label text-sm text-navy-2">{sideWord(p.market, p.side)}</span>
          <span className="t-label text-sm text-navy-2">
            STRIKE <span className="t-num ml-1 text-carbon">{fmtPrice(p.strike, m.dp)}</span>
          </span>
        </div>
        <div className="t-label flex shrink-0 items-center bg-red px-3 text-base text-coupon @md:px-4 @md:text-lg">{p.tenorDays}D</div>
      </div>

      {/* Body + stub */}
      <div className="relative flex flex-col @lg:flex-row">
        <div className={cx("relative min-w-0 flex-1 px-4 @md:px-5", p.compact ? "py-3" : "py-4")}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <div className={cx("t-display flex items-center gap-3 text-navy", p.compact ? "text-[2rem]" : "text-[2rem] @md:text-[2.5rem]")}>
                <span>{from}</span>
                <span aria-hidden className="flex w-14 items-center gap-1.5 text-red @md:w-20">
                  <span className="h-0 flex-1 border-t-2 border-dashed border-navy/40" />
                  <span className="text-xl leading-none">→</span>
                </span>
                <span>{to}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-2">
                <span className="t-label text-xs text-navy-2">{p.status === "SETTLED" ? "SETTLED" : "SETTLES"}</span>
                <span className="t-num text-sm text-navy">{fmtDate(p.maturity)}</span>
                {p.status ? <Stamp kind={p.status} pct={p.partialPct} size="md" className="ml-2" /> : null}
              </div>
            </div>
            <div className="ml-auto text-right">
              <span className="t-label block text-xs text-navy-2">{lockedLabel}</span>
              <Num className={cx("font-semibold", p.compact ? "text-2xl" : "text-2xl @md:text-3xl", voided && "line-through decoration-red decoration-2 opacity-70")}>{fmtCcy(p.lockedAmount, m.quote, m.quote === "USD" ? 2 : 0)}</Num>
            </div>
          </div>
        </div>
        {/* perforation */}
        <div className="relative perf-x @lg:perf-y" aria-hidden>
          <span className="coupon-notch hidden @lg:block" data-edge="top" style={{ left: 0 }} />
          <span className="coupon-notch hidden @lg:block" data-edge="bottom" style={{ left: 0 }} />
        </div>
        <dl className="grid grid-cols-3 content-center gap-x-3 gap-y-1.5 px-4 py-3 @lg:w-44 @lg:grid-cols-2 @lg:px-4">
          <div>
            <dt className="t-label text-xs text-navy-2">NO.</dt>
            <dd className="t-num text-sm text-navy">{p.no ?? "—"}</dd>
          </div>
          <div>
            <dt className="t-label text-xs text-navy-2">MARGIN IN</dt>
            <dd className="t-label text-sm text-navy">{p.mint}</dd>
          </div>
          <div className="@lg:col-span-2">
            <dt className="t-label text-xs text-navy-2">NOTIONAL</dt>
            <dd className="t-num text-sm text-carbon">{fmtUsd(p.notionalUsd, 0)}</dd>
          </div>
          {p.tag ? <dd className="t-label col-span-3 text-xs text-navy-2 @lg:col-span-2">{p.tag}</dd> : null}
        </dl>
      </div>
      {p.children ? <div className="border-t border-hairline px-4 py-3 @md:px-5">{p.children}</div> : null}
    </article>
  );
}
