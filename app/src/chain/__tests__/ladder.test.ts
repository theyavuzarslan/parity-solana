// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { marketById } from "shared/src/markets";
import { buildLadderTx, pickOffer, preflight, requiredCollateral, type OfferView, type Rung } from "../ladder";
import { pdas } from "../pda";
import { makeProgram } from "../program";

const PROGRAM_ID = new PublicKey("55jabap7VG6LKKJtidxVRBuLaLzFz6P96uPUicR2e4EQ");
const USDC = Keypair.generate().publicKey;
const USDG = Keypair.generate().publicKey;
const $ = (n: number) => BigInt(Math.round(n * 1e6));

const offer = (o: Partial<OfferView>): OfferView => ({
  pubkey: Keypair.generate().publicKey, maker: Keypair.generate().publicKey, marketId: 0, makerSide: "long",
  spreadBps: 40, minTenor: 7, maxTenor: 180, capacityUsd: $(250_000), marginLocked: $(40_000), positionCounter: 0n,
  mint: USDC, active: true, ...o,
});
const rungs: Rung[] = [30, 60, 90].map((t) => ({ tenorDays: t, notionalUsd: $(1_000) }));

describe("pickOffer", () => {
  it("chooses the tightest spread with enough capacity, on the maker's opposite side and same mint", () => {
    const tight = offer({ spreadBps: 15, capacityUsd: $(2_000) }); // too small for $3,000
    const best = offer({ spreadBps: 25 });
    const wide = offer({ spreadBps: 40 });
    const wrongSide = offer({ spreadBps: 5, makerSide: "short" });
    const wrongMint = offer({ spreadBps: 5, mint: USDG });
    const inactive = offer({ spreadBps: 5, active: false });
    expect(pickOffer([wide, tight, wrongSide, wrongMint, inactive, best], false, USDC, rungs)).toBe(best);
    // taker long takes a maker-short offer
    expect(pickOffer([wide, wrongSide], true, USDC, rungs)).toBe(wrongSide);
  });

  it("requires every rung inside the tenor range, and enough locked maker margin when params are given", () => {
    const short = offer({ maxTenor: 60 });
    expect(pickOffer([short], false, USDC, rungs)).toBeNull();
    const thin = offer({ marginLocked: $(100) });
    const params = { imBps: 1200, openFeeBps: 10, makerFeeShareBps: 1000, minNotional: $(10) };
    expect(pickOffer([thin], false, USDC, rungs)).toBe(thin);
    expect(pickOffer([thin], false, USDC, rungs, params)).toBeNull();
  });
});

describe("preflight", () => {
  const base = { rungs, offer: offer({}), collateralBalance: $(10_000), solLamports: 1e9, imBps: 1200, openFeeBps: 10 };

  it("ok when everything is covered", () => {
    expect(preflight(base)).toEqual({ ok: true });
  });

  it("NO_OFFER without an offer", () => {
    expect(preflight({ ...base, offer: null })).toMatchObject({ ok: false, reason: "NO_OFFER" });
  });

  it("TENOR when a rung is outside the offer's range", () => {
    expect(preflight({ ...base, offer: offer({ maxTenor: 60 }) })).toMatchObject({ ok: false, reason: "TENOR" });
  });

  it("CAPACITY when the sum of rungs exceeds the offer capacity", () => {
    expect(preflight({ ...base, offer: offer({ capacityUsd: $(2_999) }) })).toMatchObject({ ok: false, reason: "CAPACITY" });
  });

  it("NEED_SOL when the wallet cannot pay fees and rent", () => {
    expect(preflight({ ...base, solLamports: 0 })).toMatchObject({ ok: false, reason: "NEED_SOL" });
  });

  it("NEED_COLLATERAL when balance < Σ IM + Σ open fee (ceil per rung)", () => {
    // 3 × (ceil(1000 × 12%) + ceil(1000 × 0.1%)) = 3 × (120 + 1) = $363
    expect(requiredCollateral(rungs, 1200, 10)).toBe($(363));
    expect(preflight({ ...base, collateralBalance: $(362.99) })).toMatchObject({ ok: false, reason: "NEED_COLLATERAL" });
    expect(preflight({ ...base, collateralBalance: $(363) })).toEqual({ ok: true });
  });
});

describe("buildLadderTx", () => {
  it("produces N take_offer instructions with consecutive position PDAs from offer.positionCounter", async () => {
    const program = makeProgram(new Connection("http://127.0.0.1:1"), PROGRAM_ID);
    const o = offer({ positionCounter: 7n });
    const taker = Keypair.generate().publicKey;
    const { tx, positions } = await buildLadderTx(program, { taker, market: marketById(0), offer: o, rungs, tokenProgram: TOKEN_PROGRAM_ID });
    const takes = tx.instructions.filter((ix) => ix.programId.equals(PROGRAM_ID));
    expect(takes).toHaveLength(3);
    const P = pdas(PROGRAM_ID);
    expect(positions.map((p) => p.toBase58())).toEqual([7n, 8n, 9n].map((i) => P.position(o.pubkey, i).toBase58()));
    // the position account of each ix is its PDA, and every ix is signed by the taker
    takes.forEach((ix, i) => {
      expect(ix.keys.some((k) => k.pubkey.equals(positions[i]) && k.isWritable)).toBe(true);
      expect(ix.keys.some((k) => k.pubkey.equals(taker) && k.isSigner)).toBe(true);
    });
    expect(tx.feePayer?.equals(taker)).toBe(true);
  });
});
