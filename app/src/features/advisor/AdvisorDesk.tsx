"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { Risk } from "advisor";
import { useParity, useParityQuery } from "@/data/provider";
import { marketConfig } from "@/data/markets";
import { usdPerQuote } from "@/data/pricing";
import type { LadderQuote, LadderRequest, MarketQuote, Mint, Position, Preflight, Rate } from "@/data/types";
import { advise, scenarioSeries, type Advice } from "@/lib/advise";
import { fmtCcy } from "@/lib/currency";
import { cx, fmtNum, fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { ISSUE_STAGGER, spring } from "@/lib/motion";
import { PERSONAS, personaById, sideOf, type PersonaId } from "@/lib/personas";
import { Button } from "@/components/Button";
import { CarbonCopy, CopyLine } from "@/components/CarbonCopy";
import { Coupon } from "@/components/Coupon";
import { NumberField } from "@/components/Field";
import { Num } from "@/components/Num";
import { Orb } from "@/components/Orb";
import { Panel } from "@/components/Panel";
import { ScenarioChart } from "@/components/ScenarioChart";
import { Segmented } from "@/components/Segmented";
import { StatusChip } from "@/components/StatusChip";
import { FAUCET_AMOUNT } from "@/data/mockProvider";

const RISKS: { value: Risk; label: string; hint: string }[] = [
  { value: "conservative", label: "Cautious", hint: "Weights risk most (γ = 20)" },
  { value: "balanced", label: "Balanced", hint: "γ = 6" },
  { value: "opportunistic", label: "Opportunistic", hint: "Weights cost most (γ = 2)" },
];

type LockState = { kind: "idle" } | { kind: "signing" } | { kind: "done"; positions: Position[] } | { kind: "error"; message: string };

export function AdvisorDesk() {
  const params = useSearchParams();
  const { data } = useParity();
  const [personaId, setPersonaId] = useState<PersonaId>(personaById(params.get("persona")).id);
  const persona = personaById(personaId);
  const [pairIdx, setPairIdx] = useState(0);
  const pair = persona.pairs[Math.min(pairIdx, persona.pairs.length - 1)];
  const [monthly, setMonthly] = useState<number>(persona.defaultMonthlyUsd);
  const [months, setMonths] = useState(3);
  const [risk, setRisk] = useState<Risk>("balanced");
  const [mint, setMint] = useState<Mint>("USDC");
  const [fullOverride, setFullOverride] = useState(false);
  const [lock, setLock] = useState<LockState>({ kind: "idle" });

  const markets = useParityQuery((d) => d.getMarkets(), [], 30_000);
  const rates = useParityQuery((d) => d.getRates());
  const quote = markets.value?.find((m) => m.id === pair.market);

  const monthlyOk = Number.isFinite(monthly) && monthly >= 10 && monthly <= 1_000_000;
  const advice =
    quote && rates.value && monthlyOk
      ? advise({ quote, rates: rates.value, direction: pair.direction, monthlyUsd: monthly, months, risk, override: fullOverride ? 1 : null })
      : null;

  const req: LadderRequest | null = advice
    ? { market: pair.market, side: sideOf(pair.direction), mint, rungs: advice.rungs.map((r) => ({ month: r.month, tenorDays: r.tenorDays, amount: r.amount })) }
    : null;
  const reqKey = JSON.stringify(req);
  const ladder = useParityQuery((d) => (req && req.rungs.length ? d.quoteLadder(req) : Promise.resolve(null)), [reqKey]);
  const lq = ladder.value ?? null;
  const pf = useParityQuery((d) => (lq ? d.preflight(lq) : Promise.resolve(null)), [JSON.stringify(lq)]);

  const reset = () => setLock({ kind: "idle" });
  const choosePersona = (id: PersonaId) => {
    setPersonaId(id);
    setPairIdx(0);
    setMonthly(personaById(id).defaultMonthlyUsd);
    setFullOverride(false);
    reset();
  };

  const onLock = async () => {
    if (!req) return;
    setLock({ kind: "signing" });
    try {
      const res = await data.lockLadder(req);
      setLock({ kind: "done", positions: res.positions });
    } catch (e) {
      setLock({ kind: "error", message: e instanceof Error ? e.message : "The transaction failed." });
    }
  };

  const locked = lock.kind === "done";

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-12">
      {/* LEFT — booking desk inputs */}
      <section aria-labelledby="desk-t" className="min-w-0 lg:col-span-4 xl:col-span-3">
        <h1 id="desk-t" className="t-display text-3xl text-navy">Booking desk</h1>
        <p className="mt-1.5 max-w-prose text-sm text-navy-2">Tell the Advisor what you earn or owe; it sizes a ladder you lock in one signature.</p>

        <div className="mt-5 space-y-4">
          <Segmented
            label="Who is hedging"
            size="sm"
            value={personaId}
            onChange={choosePersona}
            options={PERSONAS.map((p) => ({ value: p.id, label: p.tab }))}
          />
          <p className="text-sm text-navy-2">
            <span className="t-label mr-1.5 text-navy">{persona.title}.</span>
            {persona.proposed ? <span className="t-label mr-1.5 rounded-[3px] border-[1.5px] border-warn px-1.5 py-px text-xs text-navy">PROPOSED</span> : null}
            {persona.blurb}
          </p>

          {persona.pairs.length > 1 ? (
            <Segmented
              label="Pair"
              size="sm"
              value={String(pairIdx)}
              onChange={(v) => { setPairIdx(Number(v)); setFullOverride(false); reset(); }}
              options={persona.pairs.map((p, i) => ({ value: String(i), label: p.label }))}
            />
          ) : (
            <div className="flex items-baseline justify-between gap-3 border-y border-hairline py-2">
              <span className="t-label text-xs text-navy">Pair</span>
              <span className="t-label text-base text-navy">{pair.label}</span>
            </div>
          )}

          <NumberField
            label="Monthly amount (USD)"
            prefix="$"
            value={monthly}
            min={10}
            step={100}
            onChange={(n) => { setMonthly(n); reset(); }}
            error={monthlyOk ? null : "Enter between $10 and $1,000,000 a month."}
            hint={pair.plain}
          />

          <Segmented
            label="Months ahead"
            size="sm"
            value={String(months)}
            onChange={(v) => { setMonths(Number(v)); reset(); }}
            options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
          />

          <Segmented label="Risk preference" value={risk} onChange={(v) => { setRisk(v); reset(); }} size="sm" options={RISKS} />

          <LockBlock
            lq={lq}
            preflight={pf.value ?? null}
            lock={lock}
            advice={advice}
            fullOverride={fullOverride}
            onOverride={(v) => { setFullOverride(v); reset(); }}
            onLock={onLock}
            mint={mint}
          />
        </div>
      </section>

      {/* CENTRE — the ladder as coupons */}
      <section aria-labelledby="ladder-t" className="min-w-0 lg:col-span-8 xl:col-span-6">
        <Panel
          id="ladder"
          title={locked ? "Your next settlements" : "Your coupon book"}
          aside={advice ? <span>h* = <span className="t-num text-carbon">{Math.round(advice.h * 100)}%</span> · {pair.market}</span> : null}
        >
          {!advice || !quote ? (
            <div className="flex h-64 items-center justify-center gap-3 rounded-[10px] border-2 border-dashed border-hairline">
              <Orb label="Loading prices" size={32} state="connecting" />
              <span className="t-label text-sm text-navy-2">Fetching spot and rates…</span>
            </div>
          ) : advice.rungs.length === 0 ? (
            <div className="rounded-[10px] border-2 border-dashed border-navy/40 px-5 py-8">
              <p className="t-display text-2xl text-navy">Nothing to lock at this ratio</p>
              <p className="mt-2 max-w-prose text-navy-2">{advice.why}</p>
            </div>
          ) : (
            <Ladder lq={lq} lock={lock} />
          )}
        </Panel>
      </section>

      {/* RIGHT — carbon-copy receipt */}
      <aside className="min-w-0 lg:col-span-12 xl:col-span-3">
        <Receipt lq={lq} quote={quote} mint={mint} setMint={(m) => { setMint(m); reset(); }} />
      </aside>

      {/* BELOW — the mechanism */}
      {advice && quote && rates.value ? (
        <>
          <section className="min-w-0 border-t-2 border-navy pt-8 lg:col-span-5">
            <Mechanism advice={advice} quote={quote} rates={rates.value} />
          </section>
          <section className="min-w-0 border-t-2 border-navy pt-8 lg:col-span-7">
            <Scenarios advice={advice} quote={quote} lq={lq} monthly={monthly} months={months} />
          </section>
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Ladder({ lq, lock }: { lq: LadderQuote | null; lock: LockState }) {
  const reduce = useReducedMotion();
  if (!lq) return null;
  const locked = lock.kind === "done" ? lock.positions : null;
  return (
    <>
      <ol className="space-y-4">
        <AnimatePresence initial={true} mode="popLayout">
          {lq.rungs.map((r, i) => {
            const pos = locked?.[i];
            return (
              <motion.li
                key={`${lq.market}-${lq.side}-${r.month}`}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={reduce ? { duration: 0.15 } : { ...spring, delay: i * ISSUE_STAGGER }}
              >
                <Coupon
                  index={i + 1}
                  market={lq.market}
                  side={lq.side}
                  tenorDays={r.tenorDays}
                  strike={r.strike}
                  notionalUsd={r.notionalUsd}
                  lockedAmount={r.lockedQuote}
                  maturity={r.maturity}
                  mint={lq.mint}
                  no={pos?.no}
                  status={pos ? "LOCKED" : null}
                  tag={pos ? "MOCK TX · DEMO" : "QUOTE · NOT LOCKED"}
                  compact
                />
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {locked ? (
        <p className="mt-5 flex flex-wrap items-center gap-3 text-navy">
          <span>{locked.length} coupons are in your wallet.</span>
          <Link href="/wallet" className="t-label rounded-[4px] border-2 border-navy px-3 py-1.5 text-sm transition-colors duration-150 hover:bg-navy hover:text-coupon active:scale-[0.97]">
            Open wallet →
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-sm text-navy-2">Each rung is one forward against the best demo maker offer. They lock together or not at all.</p>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */

function LockBlock({
  lq, preflight, lock, advice, fullOverride, onOverride, onLock, mint,
}: {
  lq: LadderQuote | null; preflight: Preflight | null; lock: LockState; advice: Advice | null;
  fullOverride: boolean; onOverride: (v: boolean) => void; onLock: () => void; mint: Mint;
}) {
  const { data } = useParity();
  const [faucetState, setFaucetState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [connecting, setConnecting] = useState(false);
  const advisedBelowFull = advice && !fullOverride && advice.h < 0.995;

  const notice = (() => {
    if (!preflight || preflight.ok) return null;
    switch (preflight.reason) {
      case "no-wallet":
        return (
          <Notice title="Connect a wallet to lock">
            <p>The demo wallet is simulated; no extension needed.</p>
            <Button size="sm" variant="secondary" loading={connecting} loadingLabel="Connecting…" onClick={async () => { setConnecting(true); await data.connect(); setConnecting(false); }}>
              Connect demo wallet
            </Button>
          </Notice>
        );
      case "need-tokens":
        return (
          <Notice title={`This ladder needs ${fmtUsd(preflight.requiredUsd)} test ${mint}`}>
            <p>Margin plus fee. You hold <span className="t-num text-carbon">{fmtUsd(preflight.balanceUsd)}</span>. The devnet faucet sends test tokens with no value.</p>
            <Button
              size="sm"
              variant="secondary"
              loading={faucetState === "busy"}
              loadingLabel="Requesting…"
              success={faucetState === "done" ? "SENT" : null}
              error={faucetState === "error" ? "Faucet failed — try again." : null}
              onClick={async () => {
                setFaucetState("busy");
                try { await data.faucet(mint); setFaucetState("done"); } catch { setFaucetState("error"); }
              }}
            >
              Get {fmtNum(FAUCET_AMOUNT, 0)} test {mint}
            </Button>
          </Notice>
        );
      case "market-closed":
        return (
          <Notice title={preflight.status === "STALE" ? "No live price — locking paused" : "Market closed — FX reopens Sunday 22:00 UTC"}>
            <p>{preflight.status === "STALE" ? "The price feed is unreachable, so nothing can be opened on a stale number." : "The last price is older than 120 seconds. Positions are not opened or marked on stale prices."} Demo mode in Dispatch lets you rehearse.</p>
          </Notice>
        );
      case "no-offer":
        return <Notice title="No maker offer covers this ladder">Try a smaller amount or a shorter horizon.</Notice>;
    }
  })();

  return (
    <div className="space-y-3 border-t-2 border-navy pt-4">
      {advisedBelowFull ? (
        <Segmented
          label="Hedge ratio"
          size="sm"
          value={fullOverride ? "full" : "advised"}
          onChange={(v) => onOverride(v === "full")}
          options={[{ value: "advised", label: `Advised ${Math.round(advice.h * 100)}%` }, { value: "full", label: "Lock 100%" }]}
        />
      ) : fullOverride ? (
        <Button variant="ghost" onClick={() => onOverride(false)}>Back to the advised ratio</Button>
      ) : null}
      <AnimatePresence initial={false}>
        {notice ? (
          <motion.div key="notice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {notice}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Button
        id="lock-it"
        variant="primary"
        size="lg"
        block
        disabled={!lq || !preflight?.ok || lock.kind === "done"}
        loading={lock.kind === "signing"}
        loadingLabel="Signing…"
        success={lock.kind === "done" ? "LOCKED" : null}
        error={lock.kind === "error" ? lock.message : null}
        onClick={onLock}
      >
        Lock it
      </Button>
      <p className="text-xs text-navy-2">
        {lq ? <>One transaction, {lq.rungs.length} forward{lq.rungs.length > 1 ? "s" : ""}. </> : null}
        Hedge calculator, not financial advice. Mock signing — nothing is sent to devnet yet.
      </p>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="space-y-1.5 rounded-[4px] border-2 border-navy bg-coupon px-3 py-2.5 text-sm text-navy-2">
      <p className="t-label text-sm text-navy">{title}</p>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Receipt({ lq, quote, mint, setMint }: { lq: LadderQuote | null; quote?: MarketQuote; mint: Mint; setMint: (m: Mint) => void }) {
  const m = quote ? marketConfig(quote.id) : null;
  const notional = lq?.rungs.reduce((a, r) => a + r.notionalUsd, 0) ?? 0;
  const lockedQuote = lq?.rungs.reduce((a, r) => a + r.lockedQuote, 0) ?? 0;
  const spreadUsd = lq?.rungs.reduce((a, r) => a + (r.notionalUsd * r.spreadBps) / 10_000, 0) ?? 0;
  const avgSpread = notional > 0 ? (spreadUsd / notional) * 10_000 : 0;
  const avgStrike = lq && notional > 0 ? lq.rungs.reduce((a, r) => a + r.strike * r.notionalUsd, 0) / notional : 0;
  return (
    <CarbonCopy title="Hedge receipt" aside={quote ? <StatusChip status={quote.status} /> : undefined}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="t-label text-xs text-copy-ink">Margin in</span>
        <div role="radiogroup" aria-label="Collateral mint" className="flex gap-1">
          {(["USDC", "USDG"] as const).map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={mint === x}
              onClick={() => setMint(x)}
              className={cx(
                "t-label h-8 rounded-t-[4px] border-2 border-b-0 px-3 text-xs transition-colors duration-150 active:scale-[0.97]",
                mint === x ? "border-copy-ink bg-copy-ink text-copy" : "border-copy-ink/40 text-copy-ink hover:border-copy-ink",
              )}
            >
              Test {x}
            </button>
          ))}
        </div>
      </div>
      {lq && m && quote ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2 border-y border-copy-ink/30 py-3">
            <div>
              <span className="t-label block text-xs">{lq.side === "short" ? `You lock in (${m.quote})` : `You will pay (${m.quote})`}</span>
              <Num tone="copy" className="text-[2.5rem] font-semibold leading-none">{fmtCcy(lockedQuote, m.quote, m.quote === "USD" ? 2 : 0)}</Num>
            </div>
            <span className="t-num text-sm">{lq.rungs.length} coupon{lq.rungs.length > 1 ? "s" : ""}</span>
          </div>
          <dl className="mt-1">
            <CopyLine label="Notional" value={fmtUsd(notional)} />
            <CopyLine label="Average strike" value={fmtPrice(avgStrike, m.dp)} />
            <CopyLine label={`Initial margin (${fmtNum(lq.imPct, 0)}%)`} value={fmtUsd(lq.totalMarginUsd)} />
            <CopyLine label={`Open fee (${lq.openFeeBps} bps)`} value={fmtUsd(lq.totalFeeUsd)} />
            <CopyLine label={`Maker spread (avg ${fmtNum(avgSpread, 1)} bps, in strike)`} value={fmtUsd(spreadUsd)} />
            <CopyLine strong label="To post now" value={fmtUsd(lq.requiredUsd)} testId="required" />
          </dl>
          <div className="mt-3 border-t border-dashed border-copy-ink/60 pt-3">
            <p className="t-label text-xs">Conditions</p>
            <ul className="mt-1 space-y-1 text-xs leading-snug">
              <li>Cash-settled in test {lq.mint} at maturity against the spot fixing; no lira changes hands.</li>
              <li>Margin call below 50% of initial margin. Below 20% on three fresh marks, 30% of the position is closed.</li>
              <li>Overnight gaps can skip the liquidation line; losses then follow the waterfall: loser margin → insurance fund → winner haircut.</li>
              <li>Offers come from demo makers. Prices: {quote.source === "pyth" ? "Pyth" : quote.source === "demo-override" ? "demo override (Dispatch)" : "static demo spots"}.</li>
            </ul>
          </div>
        </>
      ) : (
        <p className="py-6 text-sm">The receipt fills in as soon as the Advisor has a ladder.</p>
      )}
    </CarbonCopy>
  );
}

/* ---------------------------------------------------------------- */

function Mechanism({ advice, quote, rates }: { advice: Advice; quote: MarketQuote; rates: Rate[] }) {
  const m = marketConfig(quote.id);
  const rq = rates.find((r) => r.code === m.quote)!;
  const rb = rates.find((r) => r.code === m.baseRate)!;
  const dp = m.dp;
  const rows: { k: string; v: string; note?: string }[] = [
    { k: "Spot today", v: fmtPrice(advice.spot, dp), note: quote.source === "pyth" ? "Pyth" : quote.source === "demo-override" ? "Demo override" : "Static demo spot" },
    { k: `Forward, ${advice.horizonDays} days`, v: fmtPrice(advice.forward, dp), note: "From the rate gap, not a dealer quote" },
    { k: "Rate gap (carry)", v: `${fmtPct(advice.rateGapPct, 2, true)} a year`, note: `${fmtPct(advice.carryPct, 2, true)} over ${advice.horizonDays} days` },
    { k: "Expected spot", v: fmtPrice(advice.expected, dp), note: `Spot × recent drift ${fmtPct(advice.driftPct, 1, true)} a year` },
  ];
  return (
    <Panel title="Why this ratio" aside={<span>Rates: {rq.source}</span>}>
      <p className="t-num rounded-[4px] border border-hairline bg-coupon px-3 py-2 text-sm text-navy">
        F = S × (1 + r<sub>{m.quote}</sub>·t) / (1 + r<sub>{m.baseRate}</sub>·t) ={" "}
        <span className="text-carbon">{fmtPrice(advice.spot, dp)} × (1 + {fmtNum(rq.ratePct, 2)}%·{advice.horizonDays}/{rq.basis}) / (1 + {fmtNum(rb.ratePct, 2)}%·{advice.horizonDays}/{rb.basis})</span>
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.k} className="border-t border-hairline py-3">
            <dt className="t-label text-xs text-navy-2">{r.k}</dt>
            <dd><Num className="text-xl">{r.v}</Num></dd>
            {r.note ? <dd className="text-xs text-navy-2">{r.note}</dd> : null}
          </div>
        ))}
        <div className="border-t border-hairline py-3 sm:col-span-2">
          <dt className="t-label text-xs text-navy-2">Volatility (σ, annual)</dt>
          <dd className="flex flex-wrap items-baseline gap-x-4">
            <span className="text-sm text-navy-2">realised <Num className="text-base">{fmtPct(advice.sigmaRealised * 100, 2)}</Num></span>
            <span className="text-sm text-navy-2">used <Num className="text-xl">{fmtPct(advice.sigmaUsed * 100, 2)}</Num></span>
          </dd>
          <dd className="mt-1 text-xs text-navy-2">
            {advice.sigmaFloored
              ? "Realised volatility on a managed crawl understates devaluation risk, so the Advisor uses a 10% floor."
              : "Realised volatility is above the 10% floor and is used as is."}{" "}
            Source: {advice.volSource}, as of {advice.volAsOf}.
          </dd>
        </div>
      </dl>
      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2 border-t-2 border-navy pt-4">
        <div>
          <span className="t-label block text-xs text-navy-2">Hedge ratio h*</span>
          <Num className="t-display text-4xl leading-none">{`${Math.round(advice.h * 100)}%`}</Num>
        </div>
        <p className="max-w-prose flex-1 basis-60 text-sm text-navy">{advice.why}</p>
      </div>
    </Panel>
  );
}

function Scenarios({ advice, quote, lq, monthly, months }: { advice: Advice; quote: MarketQuote; lq: LadderQuote | null; monthly: number; months: number }) {
  const m = marketConfig(quote.id);
  const perUnitUsd = quote.spot * usdPerQuote(quote.id, quote.spot);
  const totalUnits = (monthly * months) / perUnitUsd;
  const hedgedUsd = lq?.rungs.reduce((a, r) => a + r.notionalUsd, 0) ?? 0;
  const hedgedUnits = hedgedUsd / perUnitUsd;
  const strike = lq && hedgedUsd > 0 ? lq.rungs.reduce((a, r) => a + r.strike * r.notionalUsd, 0) / hedgedUsd : advice.forward;
  const points = scenarioSeries({ totalUnits, hedgedUnits, spot: quote.spot, strike });
  const sell = advice.direction === "sell";
  return (
    <Panel title="If the rate moves" aside={<span>{months} month{months > 1 ? "s" : ""} · {fmtUsd(monthly * months, 0)} total</span>}>
      <ScenarioChart
        points={points}
        unit={m.quote}
        outcomeLabel={sell ? `${m.quote} you receive` : `${m.quote} you pay`}
        title={`${m.quote} outcome hedged versus unhedged as ${quote.id} moves from −20% to +40%`}
        caption={`Move in ${quote.id} spot from −20% to +40%; the dotted rule is today. Locked coupons hold their strike; the unhedged part floats.`}
      />
    </Panel>
  );
}
