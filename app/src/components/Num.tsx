"use client";

import { motion, useReducedMotion } from "motion/react";
import { cx } from "@/lib/format";

/**
 * Carbon numeral. A changed value fades in over 150 ms (opacity only) — never
 * count-up theatrics, and never two values overlapping.
 */
export function Num({ children, className, tone = "carbon" }: { children: string; className?: string; tone?: "carbon" | "navy" | "copy" | "red" | "inherit" }) {
  const reduce = useReducedMotion();
  const toneCls = { carbon: "text-carbon", navy: "text-navy", copy: "text-copy-ink", red: "text-red", inherit: "" }[tone];
  return (
    <motion.span
      key={children}
      className={cx("t-num inline-block whitespace-nowrap", toneCls, className)}
      initial={{ opacity: 0.35 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0.1 : 0.15, ease: "easeOut" }}
    >
      {children}
    </motion.span>
  );
}
