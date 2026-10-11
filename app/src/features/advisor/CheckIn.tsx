"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { NumberField } from "@/components/Field";
import { Segmented } from "@/components/Segmented";
import {
  FEELS, HORIZONS, PROFILE_OPTIONS, STEP_COUNT, stepCopy,
  type Answers, type Feel, type Horizon,
} from "@/lib/checkin";
import { cx, fmtNum } from "@/lib/format";
import { personaById, type PersonaId } from "@/lib/personas";

const STEP_NAMES = ["You", "Income", "Lira need", "Horizon", "Comfort"];

export interface CheckInProps {
  answers: Answers;
  step: number;
  /** answer a step; the parent decides where to go next */
  onAnswer: (patch: Partial<Answers>) => void;
  onGoto: (step: number) => void;
  /** values shown in the numeric fields before the user commits them */
  incomeDraft: number;
  setIncomeDraft: (n: number) => void;
  incomeSource: string;
  needDraft: number;
  setNeedDraft: (n: number) => void;
  /** step 6 content (summary card) */
  summary: ReactNode;
}

/** One question per step; ticket-style tappable cards; back/edit any step. */
export function CheckIn(p: CheckInProps) {
  const reduce = useReducedMotion();
  const headRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    headRef.current?.focus({ preventScroll: true });
  }, [p.step]);
  const copy = stepCopy(p.answers.profile);
  const done = p.step > STEP_COUNT;

  return (
    <div>
      <Progress answers={p.answers} step={p.step} onGoto={p.onGoto} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={p.step}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
          transition={{ duration: reduce ? 0.12 : 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="mt-4"
        >
          {done ? (
            <>
              <h2 ref={headRef} tabIndex={-1} className="t-display text-2xl text-navy outline-none">Your hedge</h2>
              <div className="mt-3">{p.summary}</div>
            </>
          ) : (
            <>
              <p className="t-label text-xs text-navy-2">Step {p.step} of {STEP_COUNT}</p>
              <h2 ref={headRef} tabIndex={-1} id={`q-${p.step}`} className="t-display mt-1 text-2xl text-navy outline-none">
                {p.step === 1 && "What describes you best?"}
                {p.step === 2 && copy.income}
                {p.step === 3 && copy.need}
                {p.step === 4 && "How far ahead do you know your income?"}
                {p.step === 5 && "If the lira moved 10% against you, how would it feel?"}
              </h2>
              <div className="mt-4">
                {p.step === 1 && (
                  <Cards
                    labelledBy="q-1"
                    value={p.answers.profile}
                    options={PROFILE_OPTIONS.map((o) => ({ ...o, tag: o.value === "saver" ? "PROPOSED" : undefined }))}
                    onPick={(v) => p.onAnswer({ profile: v as PersonaId, pairIdx: 0 })}
                  />
                )}
                {p.step === 2 && (
                  <NumberField
                    label="Monthly amount (USD)"
                    prefix="$"
                    value={p.incomeDraft}
                    min={10}
                    step={100}
                    onChange={p.setIncomeDraft}
                    error={Number.isFinite(p.incomeDraft) && p.incomeDraft >= 10 && p.incomeDraft <= 1_000_000 ? null : "Enter between $10 and $1,000,000 a month."}
                    hint={p.incomeSource}
                  />
                )}
                {p.step === 3 && (
                  <NumberField
                    label="Lira a month (TRY)"
                    prefix="₺"
                    value={p.needDraft}
                    min={1}
                    step={1000}
                    onChange={p.setNeedDraft}
                    error={Number.isFinite(p.needDraft) && p.needDraft > 0 ? null : "Enter the lira you need a month."}
                    hint={copy.needHint}
                  />
                )}
                {p.step === 4 && (
                  <Cards
                    labelledBy="q-4"
                    value={p.answers.months ? String(p.answers.months) : null}
                    options={HORIZONS.map((h) => ({ value: String(h.value), label: h.label, sub: h.sub }))}
                    onPick={(v) => p.onAnswer({ months: Number(v) as Horizon })}
                  />
                )}
                {p.step === 5 && (
                  <Cards
                    labelledBy="q-5"
                    value={p.answers.feel}
                    options={FEELS.map((f) => ({ value: f.value, label: f.label, sub: f.sub }))}
                    onPick={(v) => p.onAnswer({ feel: v as Feel })}
                  />
                )}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Five ruled ticks; answered ticks are buttons that reopen their step. */
function Progress({ answers, step, onGoto }: { answers: Answers; step: number; onGoto: (s: number) => void }) {
  const answered = [!!answers.profile, !!answers.incomeUsd, !!answers.needTry, !!answers.months, !!answers.feel];
  return (
    <ol className="flex gap-1.5" aria-label="Check-in progress">
      {STEP_NAMES.map((name, i) => {
        const n = i + 1;
        const current = n === step;
        return (
          <li key={name} className="min-w-0 flex-1">
            <button
              type="button"
              disabled={!answered[i] && !current}
              onClick={() => onGoto(n)}
              aria-current={current ? "step" : undefined}
              aria-label={`Step ${n}: ${name}${answered[i] ? ", answered — edit" : ""}`}
              className="group block w-full text-left disabled:cursor-default"
            >
              <span
                className={cx(
                  "check-tick block h-1.5 rounded-[1px] transition-colors duration-150",
                  current ? "bg-carbon" : answered[i] ? "bg-navy group-hover:bg-navy-2" : "bg-hairline",
                )}
              />
              <span className={cx("t-label mt-1 block truncate text-xs", current ? "text-navy" : "text-navy-2")}>{name}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Ticket-style tappable cards. Tab or arrow keys move; Enter/Space picks (and advances). */
function Cards({
  options, value, onPick, labelledBy,
}: { options: { value: string; label: string; sub: string; tag?: string }[]; value: string | null; onPick: (v: string) => void; labelledBy: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    refs.current[(i + d + options.length) % options.length]?.focus();
  };
  return (
    <div role="group" aria-labelledby={labelledBy} className="space-y-2">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            aria-pressed={on}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onPick(o.value)}
            className={cx(
              "option-card group flex w-full touch-manipulation items-stretch rounded-[6px] border-2 text-left transition-[background-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.98]",
              on ? "border-navy bg-navy text-coupon" : "border-navy bg-coupon text-navy hover:shadow-[3px_3px_0_var(--color-navy)]",
            )}
          >
            <span className="min-w-0 flex-1 px-3 py-2.5">
              <span className="t-label flex items-center gap-2 text-base">
                {o.label}
                {o.tag ? <span className={cx("rounded-[3px] border-[1.5px] px-1 text-xs", on ? "border-coupon" : "border-warn")}>{o.tag}</span> : null}
              </span>
              <span className={cx("block text-sm leading-snug", on ? "text-copy" : "text-navy-2")}>{o.sub}</span>
            </span>
            <span aria-hidden className={cx("t-label flex w-10 shrink-0 items-center justify-center border-l border-dashed text-sm", on ? "border-coupon/50" : "border-navy/40 text-navy-2")}>
              {on ? "✓" : String.fromCharCode(65 + i)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Pair switch shown in the summary when a profile has more than one market. */
export function PairSwitch({ profile, pairIdx, onChange }: { profile: PersonaId; pairIdx: number; onChange: (i: number) => void }) {
  const persona = personaById(profile);
  if (persona.pairs.length < 2) return null;
  return (
    <Segmented
      label="Market"
      size="sm"
      value={String(Math.min(pairIdx, persona.pairs.length - 1))}
      onChange={(v) => onChange(Number(v))}
      options={persona.pairs.map((x, i) => ({ value: String(i), label: x.label, hint: x.plain }))}
    />
  );
}

export const fmtWhole = (n: number) => fmtNum(n, 0);
