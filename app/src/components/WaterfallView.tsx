import type { Waterfall } from "@/data/types";
import { fmtUsd } from "@/lib/format";
import { CarbonCopy, CopyLine } from "./CarbonCopy";

/** Loss waterfall: loser margin → insurance fund → pro-rata winner haircut. */
export function WaterfallView({ w, mint = "USDG" }: { w: Waterfall; mint?: string }) {
  const steps = [
    { key: "margin", label: "1 · Loser margin", sub: "Posted margin taken first", v: w.loserMarginUsd },
    { key: "insurance", label: "2 · Insurance fund", sub: `Same-mint fund (${mint}) covers the next part`, v: w.insuranceUsd },
    { key: "haircut", label: "3 · Winner haircut", sub: "Remainder shaved off the winner's payout", v: w.winnerHaircutUsd },
  ] as const;
  const total = Math.max(w.owedUsd, 0.0001);
  return (
    <CarbonCopy title="Loss waterfall" aside="CARBON COPY">
      <p className="text-sm text-copy-ink">The gap jumped past the liquidation line, so the loss was paid in this order:</p>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-[2px] border border-copy-ink" aria-hidden>
        {steps.map((s, i) => (
          <span
            key={s.key}
            className={i === 0 ? "bg-copy-ink" : i === 1 ? "bg-copy-ink/55" : "bg-red"}
            style={{ width: `${(s.v / total) * 100}%` }}
          />
        ))}
      </div>
      <dl className="mt-3">
        {steps.map((s) => (
          <CopyLine
            key={s.key}
            label={<span className="flex flex-col"><span className="t-label">{s.label}</span><span className="text-xs">{s.sub}</span></span>}
            value={fmtUsd(s.v)}
            testId={`wf-${s.key}`}
          />
        ))}
        <CopyLine strong label="Owed at close" value={fmtUsd(w.owedUsd)} testId="wf-owed" />
      </dl>
    </CarbonCopy>
  );
}
