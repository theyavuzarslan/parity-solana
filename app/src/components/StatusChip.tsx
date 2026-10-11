import type { MarketStatus } from "@/data/types";
import { cx } from "@/lib/format";

const STYLE: Record<MarketStatus, string> = {
  OPEN: "border-ok text-ok",
  CLOSED: "border-navy text-navy",
  STALE: "border-warn text-navy",
};

/** Outline-only status chip (DESIGN.md §5 StatusBoard). */
export function StatusChip({ status, className }: { status: MarketStatus; className?: string }) {
  return (
    <span className={cx("t-label inline-flex h-6 items-center rounded-[3px] border-[1.5px] bg-coupon px-2 text-xs", STYLE[status], className)}>
      {status}
    </span>
  );
}

export const STATUS_NOTE: Record<MarketStatus, string | null> = {
  OPEN: null,
  CLOSED: "Market closed",
  STALE: "No live feed",
};
