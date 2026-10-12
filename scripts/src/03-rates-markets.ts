// 13 set_rate + 15 upsert_market from markets.ts. Idempotent: skips accounts already holding the same values.
import { SystemProgram } from "@solana/web3.js";
import { BN, CLUSTER, code3, configPda, deployer, logStep, marketPda, program, ratePda } from "./env.js";
import { MARKETS, RATES, type MarketMeta } from "./markets.js";

const bytes = (s: string, n: number) => Array.from(Buffer.from(s.padEnd(n, "\0").slice(0, n), "ascii"));
const feed = (hex?: string) => (hex ? Array.from(Buffer.from(hex, "hex")) : new Array(32).fill(0));

function marketArgs(mk: MarketMeta) {
  return {
    id: mk.id,
    symbol: bytes(mk.symbol, 12),
    base: bytes(mk.base, 3),
    quote: bytes(mk.quote, 3),
    feedA: feed(mk.feedA),
    feedB: feed(mk.feedB),
    op: mk.op,
    scaleNum: new BN(mk.scaleNum.toString()),
    scaleDen: new BN(mk.scaleDen.toString()),
    quoteConv: mk.quoteConv,
    imBps: mk.imBps,
    active: true,
  };
}

const same = (a: any, b: any) =>
  JSON.stringify(a, (_k, v) => (BN.isBN(v) ? v.toString() : v)) === JSON.stringify(b, (_k, v) => (BN.isBN(v) ? v.toString() : v));

async function main() {
  const admin = deployer();
  const p = program(admin);
  console.log(`[03-rates-markets] cluster=${CLUSTER}`);

  for (const r of RATES) {
    const cur: any = await p.account.rate.fetchNullable(ratePda(r.code));
    if (cur && cur.rateBps.toNumber() === r.rateBps && cur.basisDays === r.basisDays) {
      logStep(`set_rate ${r.code} ${r.rateBps}bps/${r.basisDays}`, "skip");
      continue;
    }
    const sig = await p.methods.setRate(Array.from(code3(r.code)), new BN(r.rateBps), r.basisDays).accountsPartial({
      config: configPda(), admin: admin.publicKey, rate: ratePda(r.code), systemProgram: SystemProgram.programId,
    }).rpc();
    logStep(`set_rate ${r.code} ${r.rateBps}bps/${r.basisDays}`, "done", sig);
  }

  for (const mk of MARKETS) {
    const args = marketArgs(mk);
    const cur: any = await p.account.market.fetchNullable(marketPda(mk.id));
    if (cur) {
      const { bump: _b, ...onchain } = cur;
      if (same(onchain, args)) { logStep(`upsert_market ${mk.id} ${mk.symbol}`, "skip"); continue; }
    }
    const sig = await p.methods.upsertMarket(args).accountsPartial({
      config: configPda(), admin: admin.publicKey, market: marketPda(mk.id), systemProgram: SystemProgram.programId,
    }).rpc();
    logStep(`upsert_market ${mk.id} ${mk.symbol} im=${mk.imBps}`, "done", sig);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
