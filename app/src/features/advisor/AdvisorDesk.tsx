"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { useParity, useParityQuery } from "@/data/provider";
import { marketConfig, PROTOCOL } from "@/data/markets";
import type { LadderQuote, LadderRequest, MarketQuote, Mint, Position, Preflight, Rate, WalletState } from "@/data/types";
import { advise, scenarioSeries, type Advice } from "@/lib/advise";
import {
  checkInToLadderInputs, EMPTY_ANSWERS, FEELS, firstOpenStep, HORIZONS, monthName, netLocked, PROFILE_OPTIONS,
  STEP_COUNT, summarySentence, whySentence, type Answers, type PlannedRung,
} from "@/lib/checkin";
import { fmtCcy } from "@/lib/currency";
import { cx, fmtNum, fmtPct, fmtPrice, fmtStamp, fmtUsd } from "@/lib/format";
import { ISSUE_STAGGER, spring } from "@/lib/motion";
import { personaById, sideOf } from "@/lib/personas";
import { useTheme } from "@/lib/theme";
import { sourceLabel } from "@/lib/sourceLabel";
import { useNow } from "@/lib/useNow";
import { Button } from "@/components/Button";
import { CarbonCopy, CopyLine } from "@/components/CarbonCopy";
import { BlankCoupon, Coupon } from "@/components/Coupon";
import { PositionRow, RowAxis } from "@/components/PositionRow";
import { SourceTag } from "@/components/MarketRow";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { ScenarioChart } from "@/components/ScenarioChart";
import { StatusChip } from "@/components/StatusChip";
import { FAUCET_AMOUNT } from "@/data/mockProvider";
import { CheckIn, PairSwitch } from "./CheckIn";
import { TicketSheet } from "./TicketSheet";

type LockState =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "done"; positions: Position[]; lq: LadderQuote; signature: string }
  | { kind: "error"; message: string };


export function AdvisorDesk() {
  const params = useSearchParams();
  const now = useNow();
  const fromUrl = params.get("persona");
  const [answers, setAnswers] = useState<Answers>({ ...EMPTY_ANSWERS, profile: fromUrl ? personaById(fromUrl).id : null });
  const [step, setStep] = useState(1);
  const [returnToSummary, setReturnToSummary] = useState(false);
  const [incomeDraft, setIncomeDraft] = useState<number | null>(null);
  const [needDraft, setNeedDraft] = useState<number | null>(null);
  const [mint, setMint] = useState<Mint>("USDC");
  const [fullOverride, setFullOverride] = useState(false);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [lock, setLock] = useState<LockState>({ kind: "idle" });
  const [nudge, setNudge] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ req: LadderRequest; lq: LadderQuote; quote: MarketQuote; anchor: DOMRect | null } | null>(null);

  const markets = useParityQuery((d) => d.getMarkets(), [], 30_000, (d) => d.peek?.markets());
  const rates = useParityQuery((d) => d.getRates(), [], undefined, (d) => d.peek?.rates());
  const wallet = useParityQuery((d) => d.getWallet());

  const persona = personaById(answers.profile);
  const usdtry = markets.value?.find((m) => m.id === "USD/TRY");
  const inputs = usdtry ? checkInToLadderInputs(answers, { usdTry: usdtry.spot }) : null;
  const pair = inputs?.pair ?? persona.pairs[Math.min(answers.pairIdx, persona.pairs.length - 1)];
  const side = sideOf(pair.direction);
  const quote = markets.value?.find((m) => m.id === pair.market);
  const lockedQ = useParityQuery((d) => d.lockedByMonth(pair.market, side), [pair.market, side]);
  const complete = step > STEP_COUNT && !!inputs;

  const advice =
    complete && inputs && quote && rates.value && inputs.monthlyUsd >= 10
      ? advise({ quote, rates: rates.value, direction: pair.direction, monthlyUsd: inputs.monthlyUsd, months: inputs.months, risk: inputs.risk, override: fullOverride ? 1 : null })
      : null;
  const advisedH = fullOverride && inputs && quote && rates.value && inputs.monthlyUsd >= 10
    ? advise({ quote, rates: rates.value, direction: pair.direction, monthlyUsd: inputs.monthlyUsd, months: inputs.months, risk: inputs.risk }).h
    : advice?.h ?? 1;
  const planned: PlannedRung[] = advice && inputs ? netLocked(advice.rungs, lockedQ.value ?? {}, inputs.monthlyUsd) : [];
  // The program refuses positions under the $10 minimum notional: such rungs are left out (and said so).
  const minUsd = PROTOCOL.minNotionalUsd;
  const underMin = planned.filter((r) => r.amount > 0 && r.amount < minUsd && !excluded.includes(r.month));
  const toQuote = planned.filter((r) => r.amount >= minUsd && !excluded.includes(r.month));

  const req: LadderRequest | null = toQuote.length
    ? { market: pair.market, side, mint, rungs: toQuote.map((r) => ({ month: r.month, tenorDays: r.tenorDays, amount: r.amount })) }
    : null;
  const ladder = useParityQuery((d) => (req ? d.quoteLadder(req) : Promise.resolve(null)), [JSON.stringify(req)]);
  const lq = req ? (ladder.value ?? null) : null;
  const seated = lq?.rungs.filter((r) => r.offerId) ?? [];
  const lockReq: LadderRequest | null = lq && seated.length
    ? { market: lq.market, side: lq.side, mint: lq.mint, rungs: seated.map((r) => ({ month: r.month, tenorDays: r.tenorDays, amount: r.amount })) }
    : null;
  const lockQuoteQ = useParityQuery((d) => (lockReq ? d.quoteLadder(lockReq) : Promise.resolve(null)), [JSON.stringify(lockReq)]);
  const lqLock = lockReq ? (lockQuoteQ.value ?? null) : null;
  const pfQ = useParityQuery((d) => (lqLock ? d.preflight(lqLock) : Promise.resolve(null)), [JSON.stringify(lqLock)]);
  const pf = lqLock ? (pfQ.value ?? null) : null;
  const noSeatMonths = lq?.rungs.filter((r) => !r.offerId).map((r) => r.month) ?? [];
  const whyRungs = planned.filter((r) => !excluded.includes(r.month) && !noSeatMonths.includes(r.month) && !(r.amount > 0 && r.amount < minUsd));

  /* ---- check-in navigation ---- */
  const reset = () => { setLock({ kind: "idle" }); setExcluded([]); };
  const answer = (patch: Partial<Answers>, delayMs = 0) => {
    const next = { ...answers, ...patch };
    setAnswers(next);
    reset();
    const go = () => {
      const open = firstOpenStep(next);
      if (returnToSummary && open > STEP_COUNT) { setStep(STEP_COUNT + 1); setReturnToSummary(false); return; }
      setStep((s) => (s >= STEP_COUNT ? (open > STEP_COUNT ? STEP_COUNT + 1 : open) : s + 1));
    };
    if (delayMs) setTimeout(go, delayMs); else go();
  };
  const goto = (s: number) => { setReturnToSummary(step > STEP_COUNT || returnToSummary); setStep(s); };

  const walletPrefill = wallet.value?.connected && wallet.value.balances.USDC + wallet.value.balances.USDG > 0
    ? Math.round(wallet.value.balances.USDC + wallet.value.balances.USDG)
    : null;
  const incomeValue = incomeDraft ?? answers.incomeUsd ?? walletPrefill ?? persona.defaultMonthlyUsd;
  const incomeSource = walletPrefill && answers.incomeUsd === null && incomeDraft === null
    ? `Pre-filled from your connected wallet: ${fmtNum(walletPrefill, 0)} test USDC/USDG. Edit it if your month differs.`
    : `Suggested for this profile — edit it to match yours.`;
  const needValue = needDraft ?? answers.needTry ?? persona.defaultNeedTry;
  const incomeOk = Number.isFinite(incomeValue) && incomeValue >= 10 && incomeValue <= 1_000_000;
  const needOk = Number.isFinite(needValue) && needValue > 0;

  const stepAnswered =
    step === 1 ? !!answers.profile : step === 2 ? incomeOk : step === 3 ? needOk : step === 4 ? !!answers.months : step === 5 ? !!answers.feel : true;
  const onNext = () => {
    if (!stepAnswered) { setNudge(step); return; }
    setNudge(null);
    if (step === 2) { if (incomeOk) answer({ incomeUsd: incomeValue }); return; }
    if (step === 3) { if (needOk) answer({ needTry: needValue }); return; }
    answer({});
  };

  // LOCK IT opens the order ticket; signing happens on the ticket ("Sign & lock").
  const onLock = () => {
    if (!lockReq || !lqLock || !quote) return;
    const anchor = typeof document !== "undefined" ? document.getElementById("lock-it")?.getBoundingClientRect() ?? null : null;
    setLock({ kind: "idle" });
    setSheet({ req: lockReq, lq: lqLock, quote, anchor });
  };

  const lockedUsdTotal = Object.values(lockedQ.value ?? {}).reduce((a, b) => a + b, 0);
  const m = marketConfig(pair.market);
  // USD → quote currency at upq (USD per quote unit): 1 / USD/TRY for every lira market, crosses included.
  const lockedQuoteTotal = quote ? lockedUsdTotal / quote.upq : 0;

  const summary = complete && inputs ? (
    <Summary
      answers={answers}
      inputs={inputs}
      advice={advice}
      planned={planned}
      sentence={summarySentence({ persona: inputs.persona.id, incomeUsd: inputs.incomeUsd, needTry: answers.needTry!, lockedQuote: lockedQuoteTotal, quoteCcy: m.quote })}
      why={lock.kind === "done" ? `Locked ${lock.positions.length} coupon${lock.positions.length > 1 ? "s" : ""} in one signature. Edit any answer to plan the next ones; what you hold now is netted out.` : advice ? whySentence({ rungs: whyRungs, nowSec: now, direction: pair.direction, forwardAboveExpected: advice.forward >= advice.expected, market: pair.market, override: fullOverride }) : "Enter at least $10 a month to size a ladder."}
      onEdit={goto}
      onPair={(i) => { setAnswers({ ...answers, pairIdx: i }); setFullOverride(false); reset(); }}
      underMin={underMin}
      minUsd={minUsd}
      fullOverride={fullOverride}
      advisedH={advisedH}
      onOverride={(v) => { setFullOverride(v); reset(); }}
    />
  ) : null;

  return (
    <div className="sheet -mx-4 -my-6 grid-cols-1 md:-mx-8 md:-my-8 lg:grid-cols-12">
      <h1 className="sr-only">Advisor — booking desk</h1>
      {/* LEFT — check-in + the one action */}
      <section aria-label="Check-in" className="min-w-0 px-4 py-5 md:px-6 lg:col-span-4">
        <div className="lg:sticky lg:top-4">
        <h2 className="panel-title t-label text-lg text-navy">Check-in</h2>
        <div className="mt-3">
          <CheckIn
            answers={answers}
            step={step}
            onAnswer={(patch) => { setNudge(null); answer(patch, 140); }}
            onGoto={goto}
            onSubmit={() => onNext()}
            incomeDraft={incomeValue}
            setIncomeDraft={(n) => setIncomeDraft(n)}
            incomeSource={incomeSource}
            needDraft={needValue}
            setNeedDraft={(n) => setNeedDraft(n)}
            summary={summary}
          />
        </div>
        <ActionBar
          step={step}
          complete={complete}
          stepAnswered={stepAnswered}
          nudge={nudge === step ? ({ 1: "Pick the card that fits you best.", 4: "Pick how far ahead you know.", 5: "Pick how a 10% move would feel." } as Record<number, string>)[step] ?? null : null}
          onNext={onNext}
          onBack={() => setStep((s) => Math.max(1, s - 1))}
          lqLock={lqLock}
          hasRungs={toQuote.length > 0}
          preflight={pf}
          lock={lock}
          onLock={onLock}
          mint={mint}
          quote={quote}
        />
        </div>
      </section>

      {/* CENTRE — the coupon book */}
      <section aria-labelledby="ladder-t" className="min-w-0 px-4 py-5 md:px-6 lg:col-span-8 xl:col-span-5">
        <Panel
          id="ladder"
          title={lock.kind === "done" ? "Your next settlements" : "Your coupon book"}
          aside={advice ? <span>h* = <span className="t-num text-carbon">{Math.round(advice.h * 100)}%</span> · {pair.market}</span> : <span>{pair.market}</span>}
        >
          {!complete ? (
            <div className="space-y-4">
              <BlankCoupon index={1} label="Prints after check-in" />
              <p className="text-sm text-navy-2">Answer five short questions; the Advisor then issues one coupon per month, sized to what you need.</p>
            </div>
          ) : lock.kind === "done" ? (
            <LockedBook lock={lock} />
          ) : !advice || !lq || lq.rungs.length === 0 ? (
            <div className="ticket-shell" data-flat="">
              <div className="ticket px-5 py-6" data-blank="">
                <p className="t-display text-2xl text-navy">Nothing to lock</p>
                <p className="mt-2 max-w-prose text-navy-2">{summary ? (advice ? whySentence({ rungs: planned, nowSec: now, direction: pair.direction, forwardAboveExpected: advice.forward >= advice.expected, market: pair.market }) : "Enter at least $10 a month.") : null}</p>
              </div>
            </div>
          ) : (
            <Book
              lq={lq}
              planned={planned}
              onTry90={() => { setAnswers({ ...answers, months: 3 }); reset(); }}
              onSkip={(month) => { setExcluded((x) => [...x, month]); setLock({ kind: "idle" }); }}
            />
          )}
        </Panel>
      </section>

      {/* RIGHT — carbon-copy receipt */}
      <aside className="min-w-0 px-4 py-5 md:px-6 lg:col-span-12 xl:col-span-3">
        <Receipt
          complete={complete}
          lq={lock.kind === "done" ? lock.lq : lqLock}
          quote={quote}
          mint={mint}
          setMint={(x) => { setMint(x); setLock({ kind: "idle" }); }}
          preflight={pf}
          wallet={wallet.value}
          firstNo={lock.kind === "done" ? lock.positions[0]?.no : undefined}
        />
      </aside>

      <AnimatePresence>
        {sheet ? (
          <TicketSheet
            key="ticket-sheet"
            req={sheet.req}
            lq={sheet.lq}
            quote={sheet.quote}
            anchor={sheet.anchor}
            onClose={() => setSheet(null)}
            onIssued={(res, issuedLq) => setLock({ kind: "done", positions: res.positions, lq: issuedLq, signature: res.signature })}
          />
        ) : null}
      </AnimatePresence>

      {/* BELOW — the mechanism */}
      {advice && quote && rates.value ? (
        <>
          <section className="min-w-0 px-4 py-6 md:px-6 lg:col-span-5">
            <Mechanism advice={advice} quote={quote} rates={rates.value} />
          </section>
          <section className="min-w-0 px-4 py-6 md:px-6 lg:col-span-7">
            <Scenarios advice={advice} quote={quote} lq={lock.kind === "done" ? lock.lq : lqLock} monthly={inputs!.monthlyUsd} months={inputs!.months} />
          </section>
        </>
      ) : (
        <section className="min-w-0 px-4 py-6 md:px-6 lg:col-span-12">
          <Panel title="Why this ratio">
            <p className="max-w-prose text-sm text-navy-2">
              After check-in this panel shows the arithmetic: spot, the forward from the rate gap F = S × (1 + r<sub>quote</sub>·t) / (1 + r<sub>base</sub>·t), the expected spot from recent drift, the volatility used, and the hedge ratio h* with one sentence on why.
            </p>
          </Panel>
        </section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Summary({
  answers, inputs, advice, planned, sentence, why, onEdit, onPair, fullOverride, advisedH, onOverride, underMin = [], minUsd = 10,
}: {
  answers: Answers; inputs: NonNullable<ReturnType<typeof checkInToLadderInputs>>; advice: Advice | null; planned: PlannedRung[];
  sentence: string; why: string; onEdit: (s: number) => void; onPair: (i: number) => void; fullOverride: boolean; advisedH: number; onOverride: (v: boolean) => void;
  underMin?: PlannedRung[]; minUsd?: number;
}) {
  const chips: { step: number; label: string }[] = [
    { step: 1, label: PROFILE_OPTIONS.find((o) => o.value === answers.profile)!.label },
    { step: 2, label: `$${fmtNum(answers.incomeUsd!, 0)}/mo` },
    { step: 3, label: `₺${fmtNum(answers.needTry!, 0)}/mo` },
    { step: 4, label: HORIZONS.find((h) => h.value === answers.months)!.label },
    { step: 5, label: FEELS.find((f) => f.value === answers.feel)!.label },
  ];
  const netted = planned.filter((r) => r.lockedUsd > 0);
  return (
    <div className="space-y-3">
      <p className="text-base text-navy">{sentence}</p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Your answers — select one to edit it">
        {chips.map((c) => (
          <li key={c.step}>
            <button
              type="button"
              onClick={() => onEdit(c.step)}
              className="t-label inline-flex h-7 items-center gap-1.5 rounded-[3px] border-[1.5px] border-navy bg-coupon px-2 text-xs text-navy transition-[background-color,color,transform] duration-150 hover:bg-navy hover:text-coupon active:scale-[0.97]"
            >
              {c.label}
              <span aria-hidden className="text-navy-2">✎</span>
              <span className="sr-only">— edit</span>
            </button>
          </li>
        ))}
      </ul>
      <PairSwitch profile={answers.profile!} pairIdx={answers.pairIdx} onChange={onPair} />
      <p className="border-l-2 border-navy pl-3 text-sm text-navy">{why}</p>
      {inputs.capped ? (
        <p className="text-xs text-navy-2">Capped at your lira need: about {fmtUsd(inputs.needUsd, 0)} a month, not the full {fmtUsd(inputs.incomeUsd, 0)}.</p>
      ) : null}
      {netted.length ? (
        <p className="text-xs text-navy-2">
          Netted out what you already hold: {netted.map((r) => `${fmtUsd(r.lockedUsd, 0)} in month ${r.month}`).join(", ")}.
        </p>
      ) : null}
      {underMin.length ? (
        <p className="text-xs text-navy-2" data-testid="under-min">
          Left out {underMin.map((r) => `month ${r.month} (${fmtUsd(r.amount)})`).join(", ")}: below the {fmtUsd(minUsd, 0)} minimum position size.
        </p>
      ) : null}
      {advice && (advice.h < 0.995 || fullOverride) ? (
        <Button variant="ghost" onClick={() => onOverride(!fullOverride)}>
          {fullOverride ? `Back to the advised ${Math.round(advisedH * 100)}%` : "Lock 100% instead"}
        </Button>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function ActionBar({
  step, complete, stepAnswered, nudge, onNext, onBack, lqLock, hasRungs, preflight, lock, onLock, mint, quote,
}: {
  step: number; complete: boolean; stepAnswered: boolean; nudge: string | null; onNext: () => void; onBack: () => void;
  lqLock: LadderQuote | null; hasRungs: boolean; preflight: Preflight | null; lock: LockState; onLock: () => void; mint: Mint; quote?: MarketQuote;
}) {
  const { data } = useParity();
  const { value: info } = useParityQuery((d) => (d.info ? d.info() : Promise.resolve(null)));
  const [busy, setBusy] = useState<null | "connect" | "sol" | "faucet">(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (k: "connect" | "sol" | "faucet", fn: () => Promise<unknown>) => {
    setErr(null); setBusy(k);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "That did not go through — try again."); } finally { setBusy(null); }
  };

  let button: ReactNode;
  let notice: ReactNode = null;

  if (!complete) {
    button = (
      <Button id="next-step" variant="primary" size="lg" block aria-disabled={!stepAnswered || undefined} error={nudge} onClick={onNext}>
        {step >= STEP_COUNT ? "Issue my coupons" : "Next"}
      </Button>
    );
    notice = (
      <p className="text-xs text-navy-2">
        {step === 2 || step === 3 ? "Type a round number and press Enter." : "Pick a card — it moves you on."} Every answer can be edited later.
      </p>
    );
  } else if (lock.kind === "done") {
    button = <Button id="lock-it" variant="primary" size="lg" block success="LOCKED">Lock it</Button>;
    notice = (
      <p className="text-sm text-navy">
        {lock.positions.length} coupon{lock.positions.length > 1 ? "s" : ""} in your wallet.{" "}
        <Link href="/wallet" className="t-label underline decoration-1 underline-offset-4 hover:decoration-2">Open wallet →</Link>
      </p>
    );
  } else if (!hasRungs || (!lqLock && !preflight)) {
    button = <Button id="lock-it" variant="primary" size="lg" block disabled>Lock it</Button>;
    notice = <p className="text-xs text-navy-2">{hasRungs ? "No maker is quoting any of these months right now." : "Nothing new to lock for these answers."}</p>;
  } else if (preflight && !preflight.ok && preflight.reason === "no-wallet") {
    button = (
      <Button id="lock-it" variant="primary" size="lg" block loading={busy === "connect"} loadingLabel="Connecting…" error={err} onClick={() => run("connect", () => data.connect())}>
        Connect wallet
      </Button>
    );
    notice = <Notice title="Connect a wallet to lock">Step 1 of 3. The demo wallet is simulated; no extension needed.</Notice>;
  } else if (preflight && !preflight.ok && preflight.reason === "need-sol") {
    button = (
      <Button id="lock-it" variant="primary" size="lg" block loading={busy === "sol"} loadingLabel="Requesting…" error={err} onClick={() => run("sol", () => data.requestSol())}>
        {info?.kind === "chain" && info.cluster === "devnet" ? "Open SOL faucet" : "Get test SOL"}
      </Button>
    );
    notice = (
      <Notice title="Fees need test SOL">
        Step 2 of 3. A devnet airdrop with no value pays the signature fee.
        {info?.kind === "chain" && info.cluster === "devnet" ? " Get it from faucet.solana.com first: the test-token faucet only serves wallets holding at least 0.01 SOL." : ""}
      </Notice>
    );
  } else if (preflight && !preflight.ok && preflight.reason === "need-tokens") {
    button = (
      <Button id="lock-it" variant="primary" size="lg" block loading={busy === "faucet"} loadingLabel="Requesting…" error={err} onClick={() => run("faucet", () => data.faucet(mint))}>
        Get {fmtNum(FAUCET_AMOUNT, 0)} test {mint}
      </Button>
    );
    notice = (
      <Notice title={`This ladder needs ${fmtUsd(preflight.requiredUsd)} test ${mint}`}>
        Step 3 of 3. Margin plus fee; you hold <span className="t-num text-carbon">{fmtUsd(preflight.balanceUsd)}</span>.
      </Notice>
    );
  } else if (preflight && !preflight.ok && preflight.reason === "market-closed") {
    button = <Button id="lock-it" variant="primary" size="lg" block disabled>Lock it</Button>;
    notice = (
      <Notice title="Prices are paused — rates can't be locked on a stale price">
        {quote ? (
          <span className="block text-navy-2/80">
            Last {quote.id} <span className="t-num opacity-60">{fmtPrice(quote.spot, marketConfig(quote.id).dp)}</span> at <span className="t-num">{fmtStamp(quote.publishTime)}</span>.
            {quote.status === "CLOSED" ? " FX reopens Sunday 22:00 UTC." : ""}
          </span>
        ) : null}
        {preflight.detail ? <span className="mt-0.5 block" data-testid="preflight-detail">{preflight.detail}</span> : null}
      </Notice>
    );
  } else if (preflight && !preflight.ok && preflight.reason === "no-offer") {
    button = <Button id="lock-it" variant="primary" size="lg" block disabled>Lock it</Button>;
    notice = (
      <Notice title="No maker offer covers this ladder">
        {preflight.detail ? <span className="block" data-testid="preflight-detail">{preflight.detail}</span> : null}
        <span className="block">Try a shorter horizon{preflight.detail ? ", a smaller amount or the other collateral mint" : ""}.</span>
      </Notice>
    );
  } else {
    button = (
      <Button
        id="lock-it"
        variant="primary"
        size="lg"
        block
        disabled={!lqLock || !preflight?.ok}
        loading={lock.kind === "signing"}
        loadingLabel="Signing…"
        error={lock.kind === "error" ? lock.message : null}
        onClick={onLock}
      >
        Lock it
      </Button>
    );
    notice = lqLock ? (
      <p className="text-xs text-navy-2">
        One signature, {lqLock.rungs.length} forward{lqLock.rungs.length > 1 ? "s" : ""}, {fmtUsd(lqLock.requiredUsd)} test {lqLock.mint} posted. {info?.kind === "chain" ? `Signed by your wallet, sent to ${info.cluster}.` : "Mock signing — nothing is sent to devnet yet."}
      </p>
    ) : null;
  }

  return (
    <div className="mt-5 border-t-2 border-navy pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="action-slot sm:w-[15rem] sm:shrink-0 [&_button]:whitespace-nowrap [&_button]:px-3 [&_button]:tracking-[0.04em]">{button}</div>
        <div className="min-w-0 flex-1 sm:pt-0.5" aria-live="polite">{notice}</div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        {step > 1 && lock.kind !== "done" ? <Button variant="ghost" onClick={onBack}>← Back</Button> : <span />}
        <span className="text-xs text-navy-2">Hedge calculator, not financial advice.</span>
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="status" className="space-y-0.5 text-sm text-navy-2">
      <p className="t-label text-sm text-navy">{title}</p>
      {children ? <div className="text-xs leading-snug">{children}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Book({ lq, planned, onTry90, onSkip }: { lq: LadderQuote; planned: PlannedRung[]; onTry90: () => void; onSkip: (month: number) => void }) {
  const reduce = useReducedMotion();
  const { theme } = useTheme();
  const t0 = useNow();
  const axisDays = Math.max(...lq.rungs.map((r) => r.tenorDays), 30);
  const firstSeated = lq.rungs.findIndex((r) => r.offerId);
  return (
    <>
      {theme === "solana" ? <RowAxis days={axisDays} /> : null}
      <ol className={theme === "solana" ? "space-y-2" : "space-y-4"}>
        <AnimatePresence initial={true} mode="popLayout">
          {lq.rungs.map((r, i) => {
            const noSeat = !r.offerId;
            const plannedRung = planned.find((p) => p.month === r.month);
            const common = {
              index: i + 1, market: lq.market, side: lq.side, tenorDays: r.tenorDays, strike: r.strike, notionalUsd: r.notionalUsd,
              lockedAmount: r.lockedQuote, maturity: r.maturity, mint: lq.mint, status: noSeat ? ("NO SEATS" as const) : null,
              tag: noSeat ? "NO MAKER" : "QUOTE · NOT LOCKED",
            };
            const extra = noSeat ? (
              <NoSeats market={lq.market} tenorDays={r.tenorDays} onTry90={r.tenorDays > 90 ? onTry90 : undefined} onSkip={() => onSkip(r.month)} />
            ) : plannedRung && plannedRung.lockedUsd > 0 ? (
              <p className="text-xs text-navy-2">{fmtUsd(plannedRung.lockedUsd, 0)} of {monthName(t0, r.tenorDays)} is already locked; this coupon covers the rest.</p>
            ) : null;
            return (
              <motion.li
                key={`${lq.market}-${lq.side}-${r.month}`}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={reduce ? { duration: 0.15 } : { ...spring, delay: i * ISSUE_STAGGER }}
              >
                {theme === "solana" ? (
                  <PositionRow {...common} axisDays={axisDays} openedAt={t0} active={i === firstSeated}>{extra}</PositionRow>
                ) : (
                  <Coupon {...common} compact>{extra}</Coupon>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      <p className="mt-4 text-sm text-navy-2">Each coupon is one forward against the best demo maker offer. Seated coupons lock together in one signature.</p>
    </>
  );
}

function NoSeats({ market, tenorDays, onTry90, onSkip }: { market: string; tenorDays: number; onTry90?: () => void; onSkip: () => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-navy">No maker is quoting {market} for {tenorDays} days right now.</p>
      <div className="flex flex-wrap gap-2">
        {onTry90 ? <Button size="sm" variant="secondary" onClick={onTry90}>Try 90 days</Button> : null}
        <Button size="sm" variant="secondary" onClick={onSkip}>Lock the rest without this month</Button>
      </div>
    </div>
  );
}

function LockedBook({ lock }: { lock: Extract<LockState, { kind: "done" }> }) {
  const { theme } = useTheme();
  const t0 = useNow();
  const axisDays = Math.max(...lock.positions.map((p) => p.tenorDays), 30);
  return (
    <>
      {theme === "solana" ? <RowAxis days={axisDays} /> : null}
      <ol className={theme === "solana" ? "space-y-2" : "space-y-4"}>
        {lock.positions.map((p, i) => {
          const common = {
            index: i + 1, market: p.market, side: p.side, tenorDays: p.tenorDays, strike: p.strike, notionalUsd: p.notionalUsd,
            lockedAmount: p.quantity * p.strike, maturity: p.maturity, mint: p.mint, no: p.no, status: "LOCKED" as const, tag: p.demo ? "MOCK TX · DEMO" : `TX ${lock.signature.slice(0, 8)}…`,
          };
          return (
            <li key={p.id}>
              {theme === "solana" ? <PositionRow {...common} axisDays={axisDays} openedAt={t0} /> : <Coupon {...common} compact />}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/* ---------------------------------------------------------------- */

function Receipt({
  complete, lq, quote, mint, setMint, preflight, wallet, firstNo,
}: {
  complete: boolean; lq: LadderQuote | null; quote?: MarketQuote; mint: Mint; setMint: (m: Mint) => void;
  preflight: Preflight | null; wallet?: WalletState; firstNo?: string;
}) {
  const m = quote ? marketConfig(quote.id) : null;
  const notional = lq?.rungs.reduce((a, r) => a + r.notionalUsd, 0) ?? 0;
  const lockedQuote = lq?.rungs.reduce((a, r) => a + r.lockedQuote, 0) ?? 0;
  const spreadUsd = lq?.rungs.reduce((a, r) => a + (r.notionalUsd * r.spreadBps) / 10_000, 0) ?? 0;
  const avgSpread = notional > 0 ? (spreadUsd / notional) * 10_000 : 0;
  const avgStrike = lq && notional > 0 ? lq.rungs.reduce((a, r) => a + r.strike * r.notionalUsd, 0) / notional : 0;
  const checklist = complete && lq && preflight && !preflight.ok && (preflight.reason === "no-wallet" || preflight.reason === "need-sol" || preflight.reason === "need-tokens");

  const stub = (
    <>
      <div>
        <dt className="t-label text-xs text-copy-ink">Margin in</dt>
        <dd>
          <div role="radiogroup" aria-label="Collateral mint" className="mt-1 flex flex-col gap-1">
            {(["USDC", "USDG"] as const).map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={mint === x}
                onClick={() => setMint(x)}
                className={cx(
                  "t-label h-7 rounded-[3px] border-[1.5px] px-2 text-left text-xs transition-colors duration-150 active:scale-[0.97]",
                  mint === x ? "border-copy-ink bg-copy-ink text-copy" : "border-copy-ink/40 text-copy-ink hover:border-copy-ink",
                )}
              >
                Test {x}
              </button>
            ))}
          </div>
        </dd>
      </div>
      <div>
        <dt className="t-label text-xs text-copy-ink">Coupons</dt>
        <dd className="t-num text-lg font-semibold text-copy-ink">{lq ? lq.rungs.length : "—"}</dd>
      </div>
      {quote ? (
        <div>
          <dt className="sr-only">Price status</dt>
          <dd><StatusChip status={quote.status} /></dd>
        </div>
      ) : null}
    </>
  );

  const totalLabel = m && lq ? (lq.side === "short" ? `You lock in (${m.quote})` : `You will pay (${m.quote})`) : "Locked total";
  return (
    <CarbonCopy
      title="Hedge receipt"
      aside={quote ? <span>{quote.id}</span> : undefined}
      no={firstNo ?? "—"}
      stub={stub}
      total={{ label: totalLabel, value: lq && m ? fmtCcy(lockedQuote, m.quote, m.quote === "USD" ? 2 : 0) : "—", testId: "receipt-total" }}
    >
      {!complete || !lq || !m || !quote ? (
        <p className="py-2 text-sm text-copy-ink">The receipt fills in when the Advisor issues your coupons.</p>
      ) : checklist ? (
        <Checklist wallet={wallet} mint={mint} requiredUsd={lq.requiredUsd} />
      ) : (
        <>
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
              <li>
                Offers come from demo makers. Prices: {sourceLabel(quote.source)}.
              </li>
            </ul>
          </div>
        </>
      )}
    </CarbonCopy>
  );
}

/** Not connected / no tokens: the receipt becomes a three-step checklist; the current step is highlighted. */
export function Checklist({ wallet, mint, requiredUsd }: { wallet?: WalletState; mint: Mint; requiredUsd: number }) {
  const connected = !!wallet?.connected;
  const sol = wallet?.solBalance ?? 0;
  const bal = wallet?.balances[mint] ?? 0;
  const steps = [
    { label: "Connect wallet", sub: "Demo wallet, no extension", done: connected },
    { label: "Get test SOL", sub: "At least 0.01 SOL; pays devnet fees, no value", done: connected && sol >= 0.01 },
    { label: `Get test ${mint}`, sub: `Margin + fee ${fmtUsd(requiredUsd)}; you hold ${fmtUsd(bal)}`, done: connected && bal >= requiredUsd },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="space-y-1.5" aria-label="Before you can lock">
      {steps.map((s, i) => {
        const on = i === current;
        return (
          <li
            key={s.label}
            aria-current={on ? "step" : undefined}
            className={cx("flex items-start gap-3 rounded-[3px] border-[1.5px] px-2.5 py-2", on ? "border-copy-ink bg-copy-ink text-copy" : "border-copy-ink/25 text-copy-ink")}
          >
            <span className={cx("t-num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[2px] border-[1.5px] text-sm", on ? "border-copy" : "border-copy-ink/60")}>
              {s.done ? "✓" : i + 1}
            </span>
            <span className="min-w-0">
              <span className={cx("t-label block text-sm", s.done && "line-through decoration-1")}>{s.label}</span>
              <span className="block text-xs leading-snug">{s.done ? "Done" : s.sub}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- */

function Mechanism({ advice, quote, rates }: { advice: Advice; quote: MarketQuote; rates: Rate[] }) {
  const m = marketConfig(quote.id);
  const rq = rates.find((r) => r.code === m.quote)!;
  const rb = rates.find((r) => r.code === m.baseRate)!;
  const dp = m.dp;
  const rows: { k: string; v: string; note?: ReactNode }[] = [
    { k: "Spot today", v: fmtPrice(advice.spot, dp), note: <SourceTag q={quote} className="normal-case" /> },
    { k: `Forward, ${advice.horizonDays} days`, v: fmtPrice(advice.forward, dp), note: "From the rate gap, not a dealer quote" },
    { k: "Rate gap (carry)", v: `${fmtPct(advice.rateGapPct, 2, true)} a year`, note: `${fmtPct(advice.carryPct, 2, true)} over ${advice.horizonDays} days · demo rates` },
    { k: "Expected spot", v: fmtPrice(advice.expected, dp), note: `Spot × recent drift ${fmtPct(advice.driftPct, 1, true)} a year` },
  ];
  return (
    <Panel title="Why this ratio" aside={<span>Rates: demo, to be verified</span>}>
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
  const perUnitUsd = quote.spot * quote.upq; // USD per base unit
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
