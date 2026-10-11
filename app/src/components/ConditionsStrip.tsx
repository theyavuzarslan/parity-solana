import { DemoChip } from "./DemoChip";

/** DESIGN.md §5 — exact legal copy, shown on every page. */
export const CONDITIONS_TEXT =
  "Conditions of contract: Proposed design · Solana devnet · test tokens only · not offered to anyone, including Turkish residents, pending legal advice. Hedge calculator, not financial advice.";

export function ConditionsStrip({ demoMode }: { demoMode: boolean }) {
  return (
    <footer className="conditions-strip z-30 border-t-2 border-navy bg-coupon md:sticky md:bottom-0">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 md:px-8">
        {demoMode ? <DemoChip /> : null}
        <p className="text-xs leading-snug text-navy-2 text-pretty">{CONDITIONS_TEXT}</p>
      </div>
    </footer>
  );
}
