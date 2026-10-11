import Link from "next/link";
import { cx } from "@/lib/format";

/** The one mark: PARITY in condensed caps with two red parity bars. */
export function Wordmark({ className, size = "md" }: { className?: string; size?: "md" | "xl" }) {
  return (
    <Link href="/" className={cx("group inline-flex items-center gap-2 rounded-[4px]", className)} aria-label="Parity — home">
      <span aria-hidden className={cx("flex flex-col justify-center", size === "xl" ? "gap-1.5" : "gap-1")}>
        <span className={cx("block -skew-x-[20deg] bg-red transition-transform duration-200 ease-out group-hover:translate-x-0.5", size === "xl" ? "h-2 w-10" : "h-1 w-5")} />
        <span className={cx("block -skew-x-[20deg] bg-navy", size === "xl" ? "h-2 w-10" : "h-1 w-5")} />
      </span>
      <span className={cx("t-display text-navy", size === "xl" ? "text-4xl" : "text-2xl")}>Parity</span>
    </Link>
  );
}
