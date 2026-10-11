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
  /** rendered inside the main column, beside the stub */
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  /** past ticket: greyed, no shadow */
  past?: boolean;
}

/**
 * A locked rate as a coupon: tabbed head, red tenor tab over the stub, route row,
 * departure (settlement date), carbon-struck amount, perforated stub with
 * punched notches at the tear line, status stamp. VOID adds a red hatched edge.
 */
export function Coupon(p: CouponProps) {
  const m = marketConfig(p.market);
  const [from, to] = routeOf(p.market, p.side);
  const voided = p.status === "VOID";
  const noSeats = p.status === "NO SEATS";
  const lockedLabel = voided
    ? `LOCK VOIDED · ${m.quote}`
    : noSeats ? `WOULD LOCK · ${m.quote}`
    : p.status === "SETTLED" ? `${p.side === "short" ? "RECEIVED" : "PAID"} ${m.quote}`
    : p.side === "short" ? `YOU RECEIVE ${m.quote}` : `YOU PAY ${m.quote}`;
  return (
    <div className={cx("ticket-shell", p.className)} data-flat={p.past || noSeats ? "" : undefined}>
      <article
        className={cx("ticket", (p.past || noSeats) && "opacity-75")}
        aria-label={`Coupon ${p.index}: ${sideWord(p.market, p.side)} on ${p.market}, ${p.tenorDays} days, strike ${fmtPrice(p.strike, m.dp)}${p.status ? `, ${p.status}` : ""}`}
      >
        <span className="ticket-ring" data-n="1" aria-hidden />
        <span className="ticket-ring" data-n="2" aria-hidden />
        <div className="ticket-grid">
          {/* Head: index block + tabs */}
          <div className="ticket-head flex items-stretch border-b-2 border-navy">
            <div className="coupon-index t-display flex w-11 shrink-0 rounded-tl-[8px] items-center justify-center bg-navy text-2xl text-coupon @lg:w-14 @lg:text-3xl">{p.index}</div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-2 @lg:px-4">
              <span className="t-label text-sm text-navy">{p.market}</span>
              <span className="t-label text-sm text-navy-2">{sideWord(p.market, p.side)}</span>
              <span className="t-label text-sm text-navy-2">
                STRIKE <span className="t-num ml-1 text-carbon">{fmtPrice(p.strike, m.dp)}</span>
              </span>
            </div>
          </div>
          <div className="ticket-tenor tenor-tab t-label flex items-center justify-center rounded-tr-[8px] bg-red shadow-[inset_0_-2px_0_var(--ticket-edge)] px-3 text-base text-coupon @lg:text-lg">
            {p.tenorDays}D
          </div>

          {/* Main */}
          <div className={cx("ticket-main relative px-4 @lg:px-5", p.compact ? "py-3" : "py-4")}>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <div className={cx("t-display flex items-center gap-3 text-navy", p.compact ? "text-[2rem]" : "text-[2rem] @2xl:text-[2.5rem]")}>
                  <span>{from}</span>
                  <span aria-hidden className="route-arrow flex w-12 items-center gap-1.5 text-red @lg:w-16">
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
                <Num className={cx("font-semibold", p.compact ? "text-2xl" : "text-2xl @2xl:text-3xl", (voided || noSeats) && "line-through decoration-red decoration-2 opacity-70")}>
                  {fmtCcy(p.lockedAmount, m.quote, m.quote === "USD" ? 2 : 0)}
                </Num>
              </div>
            </div>
            {p.children ? <div className="mt-3 border-t border-hairline pt-3">{p.children}</div> : null}
          </div>

          {/* Stub */}
          <dl className="ticket-stub relative grid grid-cols-3 content-center gap-x-3 gap-y-1.5 px-4 py-2.5 @lg:grid-cols-1 @lg:content-start @lg:py-4">
            <div>
              <dt className="t-label text-xs text-navy-2">NO.</dt>
              <dd className="t-num text-sm text-navy">{p.no ?? "—"}</dd>
            </div>
            <div>
              <dt className="t-label text-xs text-navy-2">MARGIN IN</dt>
              <dd className="t-label text-sm text-navy">{p.mint}</dd>
            </div>
            <div>
              <dt className="t-label text-xs text-navy-2">NOTIONAL</dt>
              <dd className="t-num text-sm text-carbon">{fmtUsd(p.notionalUsd, 0)}</dd>
            </div>
            {p.tag ? <dd className="t-label col-span-3 text-xs text-navy-2 @lg:col-span-1">{p.tag}</dd> : null}
            {voided ? <span aria-hidden className="void-edge" /> : null}
          </dl>
        </div>
      </article>
    </div>
  );
}

/** The blank coupon of an empty wallet: dashed edge, empty ruled fields, "—". */
export function BlankCoupon({ children, label = "NO TICKETS YET", index }: { children?: ReactNode; label?: string; index?: number }) {
  return (
    <div className="ticket-shell" data-flat="">
      <article className="ticket" data-blank="" aria-label={`Blank coupon: ${label.toLowerCase()}`}>
        <span className="ticket-ring" data-n="1" aria-hidden />
        <span className="ticket-ring" data-n="2" aria-hidden />
        <div className="ticket-grid">
          <div className="ticket-head flex items-stretch border-b-2 border-dashed border-navy/50">
            <div className="t-display flex w-11 shrink-0 items-center justify-center text-2xl text-navy-2 @lg:w-14">{index ?? "—"}</div>
            <div className="flex flex-1 items-center gap-6 px-3 py-2">
              {["MARKET", "SIDE", "STRIKE"].map((k) => (
                <span key={k} className="t-label text-sm text-navy-2">{k} <span className="t-num">—</span></span>
              ))}
            </div>
          </div>
          <div className="ticket-tenor t-label flex items-center justify-center border-b-2 border-dashed border-navy/50 px-3 text-base text-navy-2">—D</div>
          <div className="ticket-main relative px-4 py-5 @lg:px-5">
            <p aria-hidden className="t-display pointer-events-none select-none text-[2rem] text-navy/15 @lg:text-[2.5rem]">{label}</p>
            <div className="mt-3 space-y-2" aria-hidden>
              <div className="h-0 border-t border-hairline" />
              <div className="h-0 w-2/3 border-t border-hairline" />
            </div>
            {children ? <div className="mt-5">{children}</div> : null}
          </div>
          <dl className="ticket-stub grid grid-cols-3 content-center gap-x-3 gap-y-1.5 px-4 py-2.5 @lg:grid-cols-1 @lg:content-start @lg:py-4">
            {["NO.", "MARGIN IN", "NOTIONAL"].map((k) => (
              <div key={k}>
                <dt className="t-label text-xs text-navy-2">{k}</dt>
                <dd className="t-num text-sm text-navy-2">—</dd>
              </div>
            ))}
          </dl>
        </div>
      </article>
    </div>
  );
}
