/** DESIGN.md §6: critically damped springs, no bounce; transform/opacity only. */
export const spring = { type: "spring", bounce: 0, duration: 0.35 } as const;
export const springFast = { type: "spring", bounce: 0, duration: 0.22 } as const;
export const fade = { duration: 0.15, ease: "easeOut" } as const;
/** Coupon-book issue stagger. */
export const ISSUE_STAGGER = 0.04;
