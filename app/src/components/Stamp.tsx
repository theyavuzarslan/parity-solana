"use client";

import { motion, useReducedMotion } from "motion/react";
import { cx } from "@/lib/format";
import { fade } from "@/lib/motion";

export type StampKind = "LOCKED" | "MARGIN CALL" | "PARTIAL" | "VOID" | "SETTLED" | "ISSUED" | "SENT" | "NO SEATS";

const INK: Record<StampKind, string> = {
  LOCKED: "border-navy text-navy",
  "MARGIN CALL": "border-red text-red",
  PARTIAL: "border-red text-red",
  VOID: "border-red text-red bg-coupon",
  SETTLED: "border-carbon text-carbon",
  ISSUED: "border-navy text-navy",
  SENT: "border-carbon text-carbon",
  "NO SEATS": "border-navy text-navy",
};

/** Rubber stamp: lands with one short scale settle (1.15 → 1), no bounce. */
export function Stamp({ kind, pct, className, size = "md", inverse }: { kind: StampKind; pct?: number; className?: string; size?: "sm" | "md" | "lg"; inverse?: boolean }) {
  const reduce = useReducedMotion();
  const label = kind === "PARTIAL" ? `PARTIAL ${pct ?? 30}%` : kind;
  return (
    <motion.span
      role="status"
      aria-label={`Status: ${label}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.15, rotate: -6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: -6 }}
      transition={reduce ? fade : { type: "spring", bounce: 0, duration: 0.18 }}
      style={reduce ? { rotate: -6 } : undefined}
      className={cx(
        "stamp t-label inline-flex select-none items-center whitespace-nowrap rounded-[3px] font-extrabold",
        kind === "VOID" ? "border-[3px]" : "border-2",
        size === "sm" && "px-1.5 py-0.5 text-xs",
        size === "md" && "px-3 py-1 text-base tracking-[0.06em]",
        size === "lg" && "px-4 py-1.5 text-2xl tracking-[0.08em]",
        inverse ? "border-coupon text-coupon" : INK[kind],
        className,
      )}
    >
      {label}
    </motion.span>
  );
}
