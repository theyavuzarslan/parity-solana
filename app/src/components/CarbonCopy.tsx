import type { ReactNode } from "react";
import { cx } from "@/lib/format";

/**
 * Carbon copy as a stub ticket (DESIGN.md §5, hero.png): lilac duplicate with
 * notched corners, a vertical dashed perforation splitting off a stub column
 * (No., mint …), a horizontal tear, then a display-size carbon total.
 */
export function CarbonCopy({
  title, aside, children, className, no, stub, total,
}: {
  title: string;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** ticket number shown at the top of the stub */
  no?: string;
  /** extra stub fields (mint, count …) */
  stub?: ReactNode;
  /** display-size carbon figure under the tear */
  total?: { label: ReactNode; value: string; testId?: string; tone?: "ink" | "red" };
}) {
  const hasStub = no !== undefined || stub !== undefined;
  return (
    <section className={cx("carbon-wrap min-w-0", className)} aria-label={title}>
      <div className="carbon-ticket" data-nostub={hasStub ? undefined : ""}>
        <div className={cx(hasStub && "carbon-grid")}>
          <header className="min-w-0 px-4 pb-3 pt-4 md:px-5">
            <h3 className="t-label text-sm text-copy-ink">{title}</h3>
            {aside ? <div className="t-label mt-1 text-xs text-copy-ink">{aside}</div> : null}
          </header>
          {hasStub ? (
            <dl className="carbon-stub space-y-2 px-3 pb-3 pt-4">
              {no !== undefined ? (
                <div>
                  <dt className="t-label text-xs text-copy-ink">No.</dt>
                  <dd className="t-num text-lg font-semibold leading-tight text-copy-ink">{no}</dd>
                </div>
              ) : null}
              {stub}
            </dl>
          ) : null}
        </div>
        <div className="carbon-tear" aria-hidden />
        <div className="px-4 pb-5 pt-3 md:px-5">
          {total ? (
            <div className="mb-2">
              <span className="t-label block text-xs text-copy-ink">{total.label}</span>
              <span data-testid={total.testId} className={cx("carbon-total t-num block font-semibold leading-none", total.tone === "red" ? "text-red" : "text-copy-ink")}>
                {total.value}
              </span>
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </section>
  );
}

/** One stub field inside a carbon copy. */
export function StubField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="t-label text-xs text-copy-ink">{label}</dt>
      <dd className="t-label text-sm text-copy-ink">{children}</dd>
    </div>
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
