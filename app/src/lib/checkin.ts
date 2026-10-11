import type { Risk } from "advisor";
import type { MarketId } from "@/data/types";
import { fmtCcy } from "./currency";
import { personaById, type PairOption, type Persona, type PersonaId } from "./personas";

/**
 * Guided check-in on the Advisor: one question per step. Pure functions here
 * turn answers into Advisor inputs and the final ladder (capped by what the
 * user needs, netted against what is already locked).
 */

export type Feel = "painful" | "manageable" | "chance";
export type Horizon = 1 | 3 | 6;

export interface Answers {
  profile: PersonaId | null;
  pairIdx: number;
  /** USD a month that comes in (or goes out) */
  incomeUsd: number | null;
  /** lira a month the user needs (rent, bills, payroll …) — caps the hedge */
  needTry: number | null;
  months: Horizon | null;
  feel: Feel | null;
}

export const EMPTY_ANSWERS: Answers = { profile: null, pairIdx: 0, incomeUsd: null, needTry: null, months: null, feel: null };

export const STEP_COUNT = 5;

export const PROFILE_OPTIONS: { value: PersonaId; label: string; sub: string }[] = [
  { value: "freelancer", label: "Paid in USD/EUR", sub: "Income arrives in dollars or euros; rent and bills are in lira." },
  { value: "exporter", label: "I sell abroad", sub: "You invoice in dollars or euros and pay costs in lira." },
  { value: "importer", label: "I buy from abroad", sub: "You hold lira and owe suppliers in dollars." },
  { value: "saver", label: "I save in lira or gold", sub: "Gram gold against lira — a proposed future product." },
];

export const HORIZONS: { value: Horizon; label: string; sub: string }[] = [
  { value: 1, label: "1 month", sub: "Only next month is certain." },
  { value: 3, label: "3 months", sub: "A quarter ahead." },
  { value: 6, label: "6 months", sub: "Half a year of steady income." },
];

export const FEELS: { value: Feel; label: string; sub: string; risk: Risk }[] = [
  { value: "painful", label: "Painful", sub: "I'd rather lock more and sleep well.", risk: "conservative" },
  { value: "manageable", label: "Manageable", sub: "Balance cost against risk.", risk: "balanced" },
  { value: "chance", label: "I'd take the chance", sub: "Lock less; I can wait out a move.", risk: "opportunistic" },
];

export const riskOf = (f: Feel): Risk => FEELS.find((x) => x.value === f)!.risk;

/** Which step is the first unanswered one (1-based); STEP_COUNT + 1 = all answered. */
export function firstOpenStep(a: Answers): number {
  if (!a.profile) return 1;
  if (!(a.incomeUsd && a.incomeUsd >= 10)) return 2;
  if (!(a.needTry && a.needTry > 0)) return 3;
  if (!a.months) return 4;
  if (!a.feel) return 5;
  return STEP_COUNT + 1;
}

export interface LadderInputs {
  persona: Persona;
  pair: PairOption;
  /** hedgeable exposure per month: income capped by what the user needs, USD */
  monthlyUsd: number;
  incomeUsd: number;
  needUsd: number;
  capped: boolean;
  months: Horizon;
  risk: Risk;
}

/**
 * Answers → Advisor inputs. The monthly exposure is capped by the lira need
 * (converted at today's USD/TRY) so the ladder never locks more than you use.
 * Returns null until every step is answered.
 */
export function checkInToLadderInputs(a: Answers, ctx: { usdTry: number }): LadderInputs | null {
  if (firstOpenStep(a) <= STEP_COUNT) return null;
  const persona = personaById(a.profile);
  const pair = persona.pairs[Math.min(a.pairIdx, persona.pairs.length - 1)];
  const incomeUsd = a.incomeUsd!;
  const needUsd = ctx.usdTry > 0 ? a.needTry! / ctx.usdTry : Infinity;
  const monthlyUsd = Math.round(Math.min(incomeUsd, needUsd) * 100) / 100;
  return { persona, pair, monthlyUsd, incomeUsd, needUsd, capped: needUsd < incomeUsd, months: a.months!, risk: riskOf(a.feel!) };
}

export interface PlannedRung {
  month: number;
  tenorDays: number;
  /** what the Advisor sized before netting, USD */
  advisedUsd: number;
  /** already locked on this market/side for this month, USD */
  lockedUsd: number;
  /** what this check-in will lock, USD */
  amount: number;
  /** share of the month's exposure the rung covers after netting, 0–1 */
  share: number;
}

/** Subtract what is already locked in each month; drop months that are already covered. */
export function netLocked(
  advised: { month: number; tenorDays: number; amount: number }[],
  locked: Record<number, number>,
  monthlyUsd: number,
): PlannedRung[] {
  return advised.map((r) => {
    const lockedUsd = locked[r.month] ?? 0;
    const amount = Math.max(0, Math.round((r.amount - lockedUsd) * 100) / 100);
    return { month: r.month, tenorDays: r.tenorDays, advisedUsd: r.amount, lockedUsd, amount, share: monthlyUsd > 0 ? amount / monthlyUsd : 0 };
  });
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Calendar month a rung settles in (UTC). */
export const monthName = (nowSec: number, tenorDays: number) => MONTH_NAMES[new Date((nowSec + tenorDays * 86_400) * 1000).getUTCMonth()];

/**
 * "Lock 100% of November, 75% of December and 50% of January because the
 * lira's high interest rate works in your favour."
 */
export function whySentence(p: {
  rungs: PlannedRung[]; nowSec: number; direction: "sell" | "buy"; forwardAboveExpected: boolean; market: MarketId;
}): string {
  const live = p.rungs.filter((r) => r.amount > 0);
  if (!live.length) {
    return p.rungs.some((r) => r.lockedUsd > 0)
      ? "Nothing new to lock: the months you know about are already covered by coupons you hold."
      : "Nothing to lock at this ratio: the Advisor thinks locking would cost more than the risk it removes.";
  }
  const parts = live.map((r) => `${Math.round(r.share * 100)}% of ${monthName(p.nowSec, r.tenorDays)}`);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const lira = p.market.endsWith("/TRY");
  const reason = p.direction === "sell"
    ? p.forwardAboveExpected
      ? lira ? "the lira's high interest rate works in your favour" : "the rate gap works in your favour"
      : "locking costs a little more than the expected drift, so the Advisor holds some back"
    : p.forwardAboveExpected
      ? lira ? "the lira's high interest rate makes locking expensive for you, so the Advisor keeps it lean" : "the rate gap makes locking cost something, so the Advisor keeps it lean"
      : "locking is cheap insurance right now";
  return `Lock ${list} because ${reason}.`;
}

/** "You earn ~$3,000/month and need ~₺60,000. Already locked: ₺0." */
export function summarySentence(p: { persona: PersonaId; incomeUsd: number; needTry: number; lockedQuote: number; quoteCcy: string }): string {
  const verb = { freelancer: "earn", exporter: "invoice", importer: "pay out", saver: "set aside" }[p.persona];
  const need = p.persona === "importer" ? "can spend" : p.persona === "saver" ? "budget" : "need";
  const usd = `~$${Math.round(p.incomeUsd).toLocaleString("en-US")}`;
  return `You ${verb} ${usd}/month and ${need} ~₺${Math.round(p.needTry).toLocaleString("en-US")}. Already locked: ${fmtCcy(p.lockedQuote, p.quoteCcy, 0)}.`;
}

/** Per-profile wording for steps 2 and 3. */
export function stepCopy(profile: PersonaId | null) {
  switch (profile) {
    case "importer":
      return {
        income: "Roughly how much goes out to suppliers each month?",
        incomeHint: "In US dollars.",
        need: "How much lira can you set aside for these payments each month?",
        needHint: "Caps the hedge so you never lock more than you pay.",
      };
    case "saver":
      return {
        income: "Roughly how much do you put aside each month?",
        incomeHint: "In US dollars.",
        need: "What is your monthly gold budget in lira?",
        needHint: "Caps the hedge so you never lock more than you buy.",
      };
    default:
      return {
        income: "Roughly how much comes in each month?",
        incomeHint: "In US dollars.",
        need: "What do you need in lira each month?",
        needHint: "Rent and bills. Caps the hedge so you never lock more than you need.",
      };
  }
}
