/**
 * One-click ladder (plan Task 11): pick a maker offer, preflight the rungs, and build ONE
 * transaction of N take_offer instructions. Amounts are token base units (6 dp) as bigint.
 */
import { BN } from "@anchor-lang/core";
import { ComputeBudgetProgram, PublicKey, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { MarketMeta } from "shared/src/markets";
import type { ParityProgram } from "./program";
import { pdas, priceFeedPda } from "./pda";

export type Rung = { tenorDays: number; notionalUsd: bigint };

export type OfferView = {
  pubkey: PublicKey;
  maker: PublicKey;
  marketId: number;
  makerSide: "long" | "short";
  spreadBps: number;
  minTenor: number;
  maxTenor: number;
  capacityUsd: bigint;
  marginLocked: bigint;
  positionCounter: bigint;
  mint: PublicKey;
  active: boolean;
};

/** On-chain risk parameters the ladder math needs (from the Config account). */
export type LadderParams = { imBps: number; openFeeBps: number; makerFeeShareBps: number; minNotional: bigint };

const BPS = 10_000n;
/** ceil(x × bps / 10_000), the program's `bps_of_ceil`. */
export const bpsCeil = (x: bigint, bps: number) => (x * BigInt(bps) + BPS - 1n) / BPS;

/** What the maker's locked margin must cover per rung: IM + ceil(ceil(notional × spread) × share). */
export const makerCost = (n: bigint, spreadBps: number, p: Pick<LadderParams, "imBps" | "makerFeeShareBps">) =>
  bpsCeil(n, p.imBps) + bpsCeil(bpsCeil(n, spreadBps), p.makerFeeShareBps);

/** Collateral the taker must hold: Σ IM + Σ open fee (both ceil, per rung, like take_offer). */
export const requiredCollateral = (rungs: Rung[], imBps: number, openFeeBps: number) =>
  rungs.reduce((a, r) => a + bpsCeil(r.notionalUsd, imBps) + bpsCeil(r.notionalUsd, openFeeBps), 0n);

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const coversTenors = (o: OfferView, rungs: Rung[]) => rungs.every((r) => r.tenorDays >= o.minTenor && r.tenorDays <= o.maxTenor);

/**
 * Tightest-spread offer that can take every rung: active, same mint, maker on the opposite side
 * (a taker long takes a maker-short offer), tenor range covers each rung, capacity ≥ Σ notional,
 * and (when `params` is given) locked margin ≥ Σ maker cost. Ties go to the larger capacity.
 */
export function pickOffer(offers: OfferView[], takerLong: boolean, mint: PublicKey, rungs: Rung[], params?: LadderParams): OfferView | null {
  const makerSide = takerLong ? "short" : "long";
  const total = sum(rungs.map((r) => r.notionalUsd));
  const ok = offers.filter((o) =>
    o.active && o.makerSide === makerSide && o.mint.equals(mint) && coversTenors(o, rungs) && o.capacityUsd >= total &&
    (!params || o.marginLocked >= sum(rungs.map((r) => makerCost(r.notionalUsd, o.spreadBps, params)))));
  ok.sort((a, b) => a.spreadBps - b.spreadBps || (b.capacityUsd > a.capacityUsd ? 1 : b.capacityUsd < a.capacityUsd ? -1 : 0));
  return ok[0] ?? null;
}

export type PreflightReason = "NO_OFFER" | "NEED_SOL" | "NEED_COLLATERAL" | "CAPACITY" | "TENOR";
export type LadderPreflight = { ok: true } | { ok: false; reason: PreflightReason; message: string };

/**
 * Checks before signing, in this order: NO_OFFER → TENOR → CAPACITY → NEED_SOL → NEED_COLLATERAL.
 * `needLamports` (rent for N position accounts + fees) is computed by the caller; 0.01 SOL is the floor.
 */
export function preflight(p: {
  rungs: Rung[];
  offer: OfferView | null;
  collateralBalance: bigint;
  solLamports: number;
  imBps: number;
  openFeeBps: number;
  needLamports?: number;
  minNotional?: bigint;
  makerFeeShareBps?: number;
}): LadderPreflight {
  const { rungs, offer } = p;
  if (!offer || !offer.active) return { ok: false, reason: "NO_OFFER", message: "No maker is quoting this market and side right now." };
  const bad = rungs.find((r) => r.tenorDays < offer.minTenor || r.tenorDays > offer.maxTenor);
  if (bad) return { ok: false, reason: "TENOR", message: `The maker quotes ${offer.minTenor}–${offer.maxTenor} days; ${bad.tenorDays} days is outside that range.` };
  const total = sum(rungs.map((r) => r.notionalUsd));
  if (total > offer.capacityUsd) return { ok: false, reason: "CAPACITY", message: `The maker has $${fmtUsd(offer.capacityUsd)} of capacity left; this ladder needs $${fmtUsd(total)}.` };
  if (p.minNotional !== undefined && rungs.some((r) => r.notionalUsd < p.minNotional!)) return { ok: false, reason: "CAPACITY", message: `Each month must be at least $${fmtUsd(p.minNotional)}.` };
  if (p.makerFeeShareBps !== undefined && offer.marginLocked < sum(rungs.map((r) => makerCost(r.notionalUsd, offer.spreadBps, { imBps: p.imBps, makerFeeShareBps: p.makerFeeShareBps! })))) {
    return { ok: false, reason: "CAPACITY", message: "The maker's locked margin cannot cover this ladder." };
  }
  const needSol = Math.max(p.needLamports ?? 0, 10_000_000);
  if (p.solLamports < needSol) return { ok: false, reason: "NEED_SOL", message: `You need about ${(needSol / 1e9).toFixed(3)} test SOL for fees and account rent.` };
  const need = requiredCollateral(rungs, p.imBps, p.openFeeBps);
  if (p.collateralBalance < need) return { ok: false, reason: "NEED_COLLATERAL", message: `You need $${fmtUsd(need)} of test collateral; you hold $${fmtUsd(p.collateralBalance)}.` };
  return { ok: true };
}

const fmtUsd = (x: bigint) => (Number(x) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A rung paired with the offer it takes (lets one tx span several offers if no single one fits). */
export type Leg = Rung & { offer: OfferView };

/**
 * One take_offer instruction per rung. Positions are PDAs at `offer.positionCounter + i`, where i
 * counts the rungs already assigned to that same offer in this transaction (consecutive indices).
 */
export async function buildLadderIxs(program: ParityProgram, p: { taker: PublicKey; market: MarketMeta; legs: Leg[]; tokenProgram: PublicKey }): Promise<{ ixs: TransactionInstruction[]; positions: PublicKey[] }> {
  const P = pdas(program.programId);
  const priceA = priceFeedPda(p.market.feedA);
  const priceB = p.market.feedB ? priceFeedPda(p.market.feedB) : priceA;
  const used = new Map<string, bigint>();
  const ixs: TransactionInstruction[] = [];
  const positions: PublicKey[] = [];
  for (const leg of p.legs) {
    const key = leg.offer.pubkey.toBase58();
    const i = used.get(key) ?? 0n;
    used.set(key, i + 1n);
    const position = P.position(leg.offer.pubkey, leg.offer.positionCounter + i);
    positions.push(position);
    const mint = leg.offer.mint;
    ixs.push(await program.methods.takeOffer(new BN(leg.notionalUsd.toString()), leg.tenorDays).accountsPartial({
      taker: p.taker, config: P.config(), offer: leg.offer.pubkey, market: P.market(p.market.id), demoState: P.demo(),
      rateBase: P.rate(p.market.base), rateQuote: P.rate(p.market.quote), position, priceA, priceB,
      mint, takerAta: getAssociatedTokenAddressSync(mint, p.taker, false, p.tokenProgram),
      vault: P.vault(mint), insurance: P.insurance(mint), tokenProgram: p.tokenProgram, systemProgram: SystemProgram.programId,
    }).instruction());
  }
  return { ixs, positions };
}

/** Compute units per take_offer (CPIs + oracle parse); measured well under this on localnet. */
export const CU_PER_TAKE = 120_000;

/** The whole ladder as ONE transaction (atomic: one bad rung fails all, nothing is opened). */
export async function buildLadderTx(
  program: ParityProgram,
  p: { taker: PublicKey; market: MarketMeta; offer: OfferView; rungs: Rung[]; tokenProgram: PublicKey } | { taker: PublicKey; market: MarketMeta; legs: Leg[]; tokenProgram: PublicKey },
): Promise<{ tx: Transaction; positions: PublicKey[] }> {
  const legs = "legs" in p ? p.legs : p.rungs.map((r) => ({ ...r, offer: p.offer }));
  const { ixs, positions } = await buildLadderIxs(program, { taker: p.taker, market: p.market, legs, tokenProgram: p.tokenProgram });
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: Math.min(1_400_000, 40_000 + CU_PER_TAKE * legs.length) }));
  tx.add(...ixs);
  tx.feePayer = p.taker;
  return { tx, positions };
}
