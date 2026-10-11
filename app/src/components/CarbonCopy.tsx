import type { ReactNode } from "react";
import { cx } from "@/lib/format";

/** Lilac duplicate panel with a dashed tear line under its head (DESIGN.md §5). */
export function CarbonCopy({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("carbon-copy overflow-hidden", className)} aria-label={title}>
      <header className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4 md:px-5">
        <h3 className="t-label text-sm text-copy-ink">{title}</h3>
        {aside ? <span className="t-label text-xs text-copy-ink">{aside}</span> : null}
      </header>
      <div className="perf-x-copy" aria-hidden />
      <div className="px-4 pb-4 pt-3 md:px-5">{children}</div>
    </section>
  );
}

/** Ruled label/value line used inside carbon copies and receipts. */
export function CopyLine({ label, value, strong, testId }: { label: ReactNode; value: ReactNode; strong?: boolean; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-copy-ink/20 py-2 first:border-t-0">
      <dt className={cx("text-sm", strong ? "t-label text-copy-ink" : "text-copy-ink")}>{label}</dt>
      <dd data-testid={testId} className={cx("t-num text-right text-copy-ink", strong ? "text-xl font-semibold" : "text-base")}>{value}</dd>
    </div>
  );
}
