"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MARKETS, marketConfig } from "@/data/markets";
import { useParity, useParityQuery } from "@/data/provider";
import type { DispatchEntry, MarketId, Rate, RateCode } from "@/data/types";
import { cx, fmtNum, fmtPrice } from "@/lib/format";
import { Button } from "@/components/Button";
import { DemoChip } from "@/components/DemoChip";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { StatusChip } from "@/components/StatusChip";

/** Run a dispatch action with per-button pending state. */
function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<DispatchEntry>) => {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  };
  return { busy, run };
}

export function DispatchSheet() {
  const { data } = useParity();
  const demo = useParityQuery((d) => d.getDemo());
  const markets = useParityQuery((d) => d.getMarkets());
  const rates = useParityQuery((d) => d.getRates());
  const log = useParityQuery((d) => d.getDispatchLog());
  const { busy, run } = useAction();
  const demoOn = demo.value?.demoMode ?? false;

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-12">
      <div className="min-w-0 space-y-10 lg:col-span-8">
        <div>
          <h1 className="t-display text-3xl text-navy md:text-[3rem]">Dispatch office</h1>
          <p className="mt-2 max-w-prose text-navy-2">Admin and demo controls for the devnet rehearsal. Every action is labelled with its effect and written to the dispatch log. All actions here are mock.</p>
        </div>

        <Panel title="Demo mode" aside={demoOn ? <DemoChip /> : <span>Off</span>}>
          <div className="flex flex-col gap-4 border-y-2 border-navy bg-coupon px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-prose text-sm text-navy-2">
              On: demo prices supersede Pyth for every market, markets read OPEN, shocks and clock moves are allowed. Off: Pyth prices only, real market hours.
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={demoOn}
              aria-label="Demo mode"
              onClick={() => run("demo", () => data.demo.setDemoMode(!demoOn))}
              className={cx(
                "t-label relative flex h-10 w-36 shrink-0 items-center rounded-[4px] border-2 border-navy p-0.5 text-sm transition-colors duration-150 active:scale-[0.97]",
                demoOn ? "bg-navy" : "bg-coupon",
              )}
            >
              <span className={cx("z-10 flex-1 text-center transition-colors duration-150", demoOn ? "text-copy" : "text-coupon")}>Off</span>
              <span className={cx("z-10 flex-1 text-center transition-colors duration-150", demoOn ? "text-navy" : "text-navy")}>On</span>
              <span
                aria-hidden
                className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[2px] transition-transform duration-200 ease-out"
                style={{ transform: demoOn ? "translateX(100%)" : "translateX(0)" }}
              >
                <span className={cx("block size-full rounded-[2px]", demoOn ? "bg-coupon" : "bg-navy")} />
              </span>
            </button>
          </div>
        </Panel>

        <Panel title="Price shocks" aside={<span>Per market · demo mode only</span>}>
          <div className="border-y-2 border-navy bg-coupon">
            {MARKETS.map((m) => {
              const q = markets.value?.find((x) => x.id === m.id);
              const mult = demo.value?.shocks[m.id] ?? 1;
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hairline px-3 py-2.5 first:border-t-0">
                  <div className="flex min-w-0 flex-1 basis-40 items-baseline gap-3">
                    <span className="t-label w-20 text-base text-navy">{m.id}</span>
                    <Num className="text-sm">{q ? fmtPrice(q.spot, m.dp) : "—"}</Num>
                    {mult !== 1 ? <span className="t-num text-xs text-navy-2">×{fmtNum(mult, 4)}</span> : null}
                  </div>
                  <div className="flex gap-2">
                    {([-5, 5, 12] as const).map((pct) => (
                      <Button
                        key={pct}
                        size="sm"
                        variant="secondary"
                        disabled={!demoOn}
                        loading={busy === `${m.id}${pct}`}
                        loadingLabel="…"
                        title={pct === 12 ? "Overnight gap: +12% in one print" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% spot`}
                        onClick={() => run(`${m.id}${pct}`, () => data.demo.shock(m.id as MarketId, pct))}
                        className="min-w-[4.5rem]"
                      >
                        {pct === 12 ? "+12% gap" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {!demoOn ? <p className="mt-2 text-sm text-navy-2">Turn demo mode on to shock prices.</p> : null}
        </Panel>

        <Panel title="Clock and crank">
          <div className="grid gap-6 border-y-2 border-navy bg-coupon px-4 py-4 sm:grid-cols-2">
            <Group label="Protocol clock" note={`Offset +${demo.value?.clockOffsetDays ?? 0} days. Moves maturities into reach of Settle.`}>
              <Button size="sm" variant="secondary" disabled={!demoOn} loading={busy === "c30"} onClick={() => run("c30", () => data.demo.advanceClock(30))}>Clock +30d</Button>
              <Button size="sm" variant="secondary" disabled={!demoOn} loading={busy === "c90"} onClick={() => run("c90", () => data.demo.advanceClock(90))}>Clock +90d</Button>
            </Group>
            <Group label="Keeper crank" note="Mark updates equity and status; Liquidate closes 30% below the 20% line; Settle pays matured coupons.">
              <Button size="sm" variant="secondary" loading={busy === "mark"} onClick={() => run("mark", () => data.demo.markNow())}>Mark now</Button>
              <Button size="sm" variant="secondary" loading={busy === "liq"} onClick={() => run("liq", () => data.demo.liquidate())}>Liquidate</Button>
              <Button size="sm" variant="secondary" loading={busy === "settle"} onClick={() => run("settle", () => data.demo.settle())}>Settle</Button>
            </Group>
          </div>
          <div className="mt-3">
            <Button variant="ghost" onClick={() => run("reset", () => data.demo.reset())}>Reset demo state</Button>
          </div>
        </Panel>

        <Panel title="Rate registry" aside={<span>13 codes · demo, to be verified</span>}>
          {rates.value ? <RateTable rates={rates.value} onSet={(c, v) => run(`rate-${c}`, () => data.demo.setRate(c, v))} busy={busy} /> : null}
        </Panel>
      </div>

      <aside className="min-w-0 lg:col-span-4">
        <div className="lg:sticky lg:top-6">
          <Panel title="Dispatch log" aside={<span>{log.value?.length ?? 0} entries</span>}>
            <ol className="max-h-[70vh] overflow-y-auto border-y-2 border-navy bg-coupon" aria-live="polite">
              {(log.value ?? []).length === 0 ? (
                <li className="px-3 py-6 text-sm text-navy-2">Nothing dispatched yet. Actions on this sheet appear here, newest first.</li>
              ) : (
                log.value!.map((e) => (
                  <li key={e.id} className="border-t border-hairline px-3 py-2.5 first:border-t-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="t-label text-sm text-navy">{e.action}</span>
                      <time className="t-num text-xs text-navy-2" dateTime={new Date(e.at).toISOString()}>
                        {new Date(e.at).toISOString().slice(11, 19)} UTC
                      </time>
                    </div>
                    <p className="text-sm text-navy-2">{e.effect}</p>
                  </li>
                ))
              )}
            </ol>
          </Panel>
          <div className="mt-6 flex flex-wrap gap-2">
            {(markets.value ?? []).filter((m) => ["USD/TRY", "EUR/TRY", "GAU/TRY"].includes(m.id)).map((m) => (
              <span key={m.id} className="flex items-center gap-2 rounded-[4px] border border-hairline bg-coupon px-2 py-1">
                <span className="t-label text-xs text-navy">{m.id}</span>
                <StatusChip status={m.status} />
              </span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Group({ label, note, children }: { label: string; note: string; children: ReactNode }) {
  return (
    <div>
      <span className="t-label text-sm text-navy">{label}</span>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
      <p className="mt-2 text-xs text-navy-2">{note}</p>
    </div>
  );
}

function RateTable({ rates, onSet, busy }: { rates: Rate[]; onSet: (c: RateCode, v: number) => void; busy: string | null }) {
  return (
    <div className="border-y-2 border-navy bg-coupon">
      <div className="t-label hidden grid-cols-[4rem_1fr_5rem_auto] gap-3 px-3 py-2 text-xs text-navy-2 sm:grid">
        <span>Code</span><span>Annual rate</span><span>Basis</span><span className="sr-only">Action</span>
      </div>
      {rates.map((r) => <RateRow key={r.code} r={r} onSet={onSet} busy={busy === `rate-${r.code}`} />)}
    </div>
  );
}

function RateRow({ r, onSet, busy }: { r: Rate; onSet: (c: RateCode, v: number) => void; busy: boolean }) {
  const [v, setV] = useState(String(r.ratePct));
  useEffect(() => setV(String(r.ratePct)), [r.ratePct]);
  const n = Number(v);
  const valid = v.trim() !== "" && Number.isFinite(n) && n >= -5 && n <= 200;
  const dirty = valid && n !== r.ratePct;
  const id = `rate-${r.code}`;
  return (
    <form
      className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 border-t border-hairline px-3 py-2 sm:grid-cols-[4rem_1fr_5rem_auto]"
      onSubmit={(e) => { e.preventDefault(); if (dirty) onSet(r.code, n); }}
    >
      <label htmlFor={id} className="t-label text-base text-navy">{r.code}</label>
      <div className={cx("flex h-9 items-center rounded-[4px] border-2 bg-coupon px-2 focus-within:border-carbon", valid ? "border-navy" : "border-red")}>
        <input
          id={id}
          type="number"
          step="0.05"
          inputMode="decimal"
          value={v}
          aria-invalid={!valid || undefined}
          onChange={(e) => setV(e.target.value)}
          className="t-num w-full min-w-0 bg-transparent text-carbon outline-none focus-visible:outline-none"
        />
        <span className="t-num text-navy-2">%</span>
      </div>
      <span className="t-num hidden text-sm text-navy-2 sm:block">/{r.basis}</span>
      <Button type="submit" size="sm" variant="secondary" disabled={!dirty} loading={busy} loadingLabel="…">Set</Button>
    </form>
  );
}
