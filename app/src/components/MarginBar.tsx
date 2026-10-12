import { PROTOCOL } from "@/data/markets";
import { cx, fmtUsd } from "@/lib/format";

/**
 * Equity as a share of initial margin, with the call (50%) and liquidation
 * (20%) lines marked. Scale: 0 → 100% of IM (equity above IM pins full).
 */
export function MarginBar({ equityUsd, imUsd, className }: { equityUsd: number; imUsd: number; className?: string }) {
  const ratio = imUsd > 0 ? equityUsd / imUsd : 0;
  const pct = Math.round(ratio * 100);
  const fill = Math.max(0, Math.min(1, ratio));
  const zone = ratio < PROTOCOL.liqEquity ? "liq" : ratio < PROTOCOL.callEquity ? "call" : "ok";
  const words = {
    ok: "Healthy — above the call line",
    call: "Margin call — below the call line, add margin",
    liq: "Below the liquidation line — 30% closes after three fresh marks",
  }[zone];
  return (
    <div className={cx("w-full", className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="t-label text-navy-2">EQUITY / INITIAL MARGIN</span>
        <span className="t-num text-carbon">
          {equityUsd < 0 ? "−" : ""}{fmtUsd(equityUsd)} / {fmtUsd(imUsd)} · {pct}%
        </span>
      </div>
      <div className="relative mt-1 h-4 text-xs text-navy">
        <span className="t-label absolute -translate-x-1/2 whitespace-nowrap" style={{ left: "50%" }}>Call 50%</span>
      </div>
      <div
        role="meter"
        aria-label="Equity as a share of initial margin"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% of initial margin. ${words}`}
        className="relative mt-0.5 h-3 w-full overflow-visible rounded-[2px] border-[1.5px] border-navy bg-coupon"
      >
        <div
          className={cx("absolute inset-y-0 left-0 origin-left transition-transform duration-300 ease-out", zone === "ok" ? "bg-carbon" : "bg-red")}
          style={{ width: "100%", transform: `scaleX(${fill})` }}
        />
        {([
          ["call", PROTOCOL.callEquity],
          ["liq", PROTOCOL.liqEquity],
        ] as const).map(([k, t]) => (
          <span
            key={k}
            data-testid={`threshold-${k}`}
            data-threshold={String(t)}
            aria-hidden
            className={cx("absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2", k === "call" ? "bg-navy" : "bg-red")}
            style={{ left: `${t * 100}%` }}
          />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-xs text-navy-2">
        <span className="t-label absolute whitespace-nowrap text-red" style={{ left: "calc(20% - 4px)" }}>↑ Liquidation 20%</span>
      </div>
      <p className={cx("mt-1 text-sm", zone === "ok" ? "text-navy-2" : "text-red")}>{words}</p>
    </div>
  );
}
