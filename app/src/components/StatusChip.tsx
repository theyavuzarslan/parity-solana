import type { MarketStatus } from "@/data/types";
import { cx } from "@/lib/format";

const STYLE: Record<MarketStatus, string> = {
  OPEN: "border-ok text-ok",
  CLOSED: "border-navy text-navy",
  STALE: "border-warn text-navy",
  REF: "border-dashed border-navy-2 text-navy-2",
};

const TITLE: Record<MarketStatus, string> = {
  OPEN: "Fresh price",
  CLOSED: "Last price older than 120 seconds — market closed",
  STALE: "No feed for this market — demo price",
  REF: "Daily reference, not a live feed (ECB)",
};

/** Outline-only status chip (DESIGN.md §5 StatusBoard). */
export function StatusChip({ status, className }: { status: MarketStatus; className?: string }) {
  return (
    <span
      title={TITLE[status]}
      className={cx("chip t-label inline-flex h-6 items-center rounded-[3px] border-[1.5px] bg-coupon px-2 text-xs", STYLE[status], className)}
    >
      {status}
      {status === "REF" ? <span className="sr-only"> — daily reference, not a live feed</span> : null}
    </span>
  );
}

export const STATUS_NOTE: Record<MarketStatus, string | null> = {
  OPEN: null,
  CLOSED: "Market closed",
  STALE: "No feed · demo price",
  REF: "Daily reference, not a live feed",
};

/** Second line under a status note. */
export const STATUS_SUB: Record<MarketStatus, string | null> = {
  OPEN: null,
  CLOSED: "FX reopens Sunday 22:00 UTC",
  STALE: null,
  REF: null,
};
