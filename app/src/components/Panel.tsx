import type { ReactNode } from "react";
import { cx } from "@/lib/format";

/** Ruled counter panel with a "///" title. */
export function Panel({ title, aside, children, className, as: Tag = "section", id }: { title: string; aside?: ReactNode; children: ReactNode; className?: string; as?: "section" | "div" | "aside"; id?: string }) {
  return (
    <Tag className={cx("min-w-0", className)} aria-labelledby={id ? `${id}-t` : undefined}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id ? `${id}-t` : undefined} className="panel-title t-label text-lg text-navy">{title}</h2>
        {aside ? <div className="t-label text-xs text-navy-2">{aside}</div> : null}
      </div>
      {children}
    </Tag>
  );
}
