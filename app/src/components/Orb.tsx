"use client";

import { ThinkingOrb } from "thinking-orbs";
import { useReducedMotion } from "motion/react";
import { ORB_INK_NAVY } from "@/lib/tokens";

/**
 * Pending indicator — `thinking-orbs` by Jakub Antalik (MIT,
 * github.com/Jakubantalik/Libraries.dev). Navy ink on paper; the only looping
 * animation allowed in the app, frozen under reduced motion.
 */
export function Orb({ size = 20, label, state = "working" }: { size?: 20 | 32 | 64; label: string; state?: "working" | "connecting" | "searching" }) {
  const reduce = useReducedMotion();
  return <ThinkingOrb state={state} size={size} theme="light" color={ORB_INK_NAVY} paused={!!reduce} aria-label={label} />;
}
