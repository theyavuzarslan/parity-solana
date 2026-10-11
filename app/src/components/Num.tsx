"use client";

import { AnimatePresence, motion } from "motion/react";
import { cx } from "@/lib/format";

/** Carbon numeral. Value changes cross-fade (≤150 ms) — never count-up theatrics. */
export function Num({ children, className, tone = "carbon" }: { children: string; className?: string; tone?: "carbon" | "navy" | "copy" | "red" | "inherit" }) {
  const toneCls = { carbon: "text-carbon", navy: "text-navy", copy: "text-copy-ink", red: "text-red", inherit: "" }[tone];
  return (
    <span className={cx("t-num relative inline-grid", toneCls, className)}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={children}
          className="col-start-1 row-start-1 whitespace-nowrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
