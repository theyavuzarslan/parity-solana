/**
 * On-chain prices: simulate `debug_price(market_id)` (a permissionless view) and decode the
 * `PriceRead` events, so the UI shows exactly the price the program would use — Pyth, or the
 * relayed/shocked demo price when demo mode is on. No signature or SOL is spent.
 */
import { BN } from "@anchor-lang/core";
import { ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction, type Connection } from "@solana/web3.js";
import { MARKETS, marketById } from "shared/src/markets";
import { eventParser, type ParityProgram } from "./program";
import { pdas, priceFeedPda } from "./pda";

export type PriceReadView = { marketId: number; a: bigint; b: bigint; spot: number; upq: number; publishTime: number };

/** Markets per simulated transaction (keeps the message under the 1232-byte packet limit). */
const CHUNK = 5;

async function simulate(program: ParityProgram, connection: Connection, payer: PublicKey, ids: number[]): Promise<{ ok: boolean; reads: PriceReadView[] }> {
  const P = pdas(program.programId);
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })];
  for (const id of ids) {
    const mk = marketById(id);
    const priceA = priceFeedPda(mk.feedA);
    ixs.push(await program.methods.debugPrice(id).accountsPartial({
      config: P.config(), market: P.market(id), demoState: P.demo(), priceA, priceB: mk.feedB ? priceFeedPda(mk.feedB) : priceA,
    }).instruction());
  }
  const msg = new TransactionMessage({ payerKey: payer, recentBlockhash: PublicKey.default.toBase58(), instructions: ixs }).compileToV0Message();
  const res = await connection.simulateTransaction(new VersionedTransaction(msg), { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  const reads: PriceReadView[] = [];
  for (const ev of eventParser(program).parseLogs(res.value.logs ?? [])) {
    if (ev.name !== "priceRead" && ev.name !== "PriceRead") continue;
    const d = ev.data as { marketId: number; a: BN; b: BN; spot: BN; upq: BN; publishTime: BN };
    reads.push({
      marketId: d.marketId, a: BigInt(d.a.toString()), b: BigInt(d.b.toString()),
      spot: Number(d.spot.toString()) / 1e8, upq: Number(d.upq.toString()) / 1e8, publishTime: Number(d.publishTime.toString()),
    });
  }
  return { ok: !res.value.err, reads };
}

/**
 * Reads every market (or `ids`). A failing debug_price aborts the rest of its transaction, so a
 * failed chunk is retried market by market; markets that still fail (no fresh Pyth price, e.g. a
 * closed FX market) are simply absent and the caller falls back to the server price route.
 */
export async function readOnchainPrices(program: ParityProgram, connection: Connection, payer: PublicKey, ids = MARKETS.map((m) => m.id)): Promise<Map<number, PriceReadView>> {
  const out = new Map<number, PriceReadView>();
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  await Promise.all(chunks.map(async (chunk) => {
    try {
      const r = await simulate(program, connection, payer, chunk);
      r.reads.forEach((x) => out.set(x.marketId, x));
      if (r.ok) return;
    } catch { /* retry singly below */ }
    await Promise.all(chunk.filter((id) => !out.has(id)).map(async (id) => {
      try { (await simulate(program, connection, payer, [id])).reads.forEach((x) => out.set(x.marketId, x)); } catch { /* fallback */ }
    }));
  }));
  return out;
}
