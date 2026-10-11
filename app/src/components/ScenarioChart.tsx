"use client";

import { useEffect, useRef, useState } from "react";
import { fmtNum } from "@/lib/format";

export interface ScenarioPoint {
  shock: number;
  hedged: number;
  unhedged: number;
}

/**
 * Ruled scenario chart in the world's grammar: hairline rules, carbon solid
 * line for the hedged outcome, navy dashed for unhedged. Rendered at the real
 * container width so labels never shrink below 12px.
 */
export function ScenarioChart({ points, unit, outcomeLabel, title, caption }: { points: ScenarioPoint[]; unit: string; outcomeLabel: string; title: string; caption: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length === 0) return null;
  const h = 240;
  const pad = { l: 56, r: 12, t: 12, b: 34 };
  const xs = points.map((p) => p.shock);
  const ys = points.flatMap((p) => [p.hedged, p.unhedged]);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const span = yMax - yMin || Math.abs(yMax) || 1;
  const y0 = yMin - span * 0.08;
  const y1 = yMax + span * 0.08;
  const x = (s: number) => pad.l + ((s - xs[0]) / (xs[xs.length - 1] - xs[0])) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (h - pad.t - pad.b);
  const path = (k: "hedged" | "unhedged") => points.map((p, i) => `${i ? "L" : "M"}${x(p.shock).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const ticksY = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);
  const compact = (v: number) => (Math.abs(v) >= 1e6 ? `${fmtNum(v / 1e6, 2)}M` : Math.abs(v) >= 1e3 ? `${fmtNum(v / 1e3, 0)}k` : fmtNum(v, 0));
  const tickEvery = w < 420 ? 4 : 2;
  const today = points.find((p) => p.shock === 0);

  return (
    <figure className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="t-label flex items-center gap-2 text-navy">
          <svg width="24" height="6" aria-hidden><line x1="0" x2="24" y1="3" y2="3" className="stroke-carbon" strokeWidth="2.5" /></svg>
          Hedged
        </span>
        <span className="t-label flex items-center gap-2 text-navy">
          <svg width="24" height="6" aria-hidden><line x1="0" x2="24" y1="3" y2="3" className="stroke-navy" strokeWidth="2" strokeDasharray="5 4" /></svg>
          Unhedged
        </span>
        <span className="t-label text-navy-2">{outcomeLabel} ({unit})</span>
      </div>
      <div ref={ref} className="w-full">
        <svg width={w} height={h} role="img" aria-label={title} className="block overflow-visible">
          {ticksY.map((v, i) => (
            <g key={i}>
              <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} className="stroke-hairline" strokeWidth="1" />
              <text x={pad.l - 8} y={y(v)} dy="0.32em" textAnchor="end" className="t-num fill-navy-2 text-xs">{compact(v)}</text>
            </g>
          ))}
          <line x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} className="stroke-navy" strokeWidth="1.5" />
          <line x1={x(0)} x2={x(0)} y1={pad.t} y2={h - pad.b} className="stroke-navy" strokeWidth="1" strokeDasharray="2 3" />
          {points.map((p, i) =>
            i % tickEvery === 0 || p.shock === 0 ? (
              <text key={p.shock} x={x(p.shock)} y={h - pad.b + 18} textAnchor="middle" className="t-num fill-navy-2 text-xs">
                {p.shock > 0 ? "+" : p.shock < 0 ? "−" : ""}{Math.abs(Math.round(p.shock * 100))}%
              </text>
            ) : null,
          )}
          <path d={path("unhedged")} fill="none" className="stroke-navy" strokeWidth="2" strokeDasharray="6 5" />
          <path d={path("hedged")} fill="none" className="stroke-carbon" strokeWidth="2.5" strokeLinejoin="round" />
          {today ? <circle cx={x(0)} cy={y(today.hedged)} r="4" className="fill-carbon" /> : null}
        </svg>
      </div>
      <figcaption className="mt-1 text-xs text-navy-2">{caption}</figcaption>
    </figure>
  );
}
