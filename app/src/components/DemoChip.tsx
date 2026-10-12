export function DemoChip() {
  return (
    <span className="t-label inline-flex w-fit shrink-0 items-center gap-1.5 rounded-[3px] border-2 border-warn bg-coupon px-2 py-0.5 text-xs text-navy">
      <span aria-hidden className="size-2 rounded-full bg-warn" />
      DEMO MODE
    </span>
  );
}

/** The app is showing in-memory preview data, not the deployed program (no program id / no config). */
export function PreviewChip() {
  return (
    <span title="No deployed program found: balances, offers and coupons are simulated in this browser." className="t-label inline-flex w-fit shrink-0 items-center gap-1.5 rounded-[3px] border-2 border-dashed border-navy-2 bg-coupon px-2 py-0.5 text-xs text-navy">
      <span aria-hidden className="size-2 rounded-full border border-navy-2" />
      PREVIEW DATA
    </span>
  );
}
