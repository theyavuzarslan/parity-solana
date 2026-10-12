// E2E check (localnet / devnet): a 6-rung ladder as ONE transaction, built like the app's
// buildLadderTx (compute-budget ix + one take_offer per rung on the same offer, consecutive
// position indices), plus the Dispatch "Reset demo state" transaction (set_demo_clock + 15 ×
// set_demo_price(set=false)). Prints serialized sizes (limit 1232 bytes) and compute units.
// Env: MARKET (default 0 = USD/TRY), RUNGS (default 6), NOTIONAL per rung (USD, default 500), RESET=1.
import { ComputeBudgetProgram, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  BN, CLUSTER, USD, configPda, connection, demoPda, deployer, ensureSol, insurancePda, keypair, marketPda,
  offerPda, positionPda, priceFeedPda, program, ratePda, readMints, tokenProgramFor, vaultPda,
} from "./env.js";
import { MARKETS, marketById } from "./markets.js";
import { topUpTokens } from "./tokens.js";

const CU_PER_TAKE = 120_000; // app/src/chain/ladder.ts

async function sizeAndSend(label: string, tx: Transaction, signers: any[]) {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const bytes = tx.serialize().length;
  console.log(`[e2e] ${label}: ${tx.instructions.length} ixs, ${bytes} bytes (limit 1232)`);
  const sig = await sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed" });
  const t = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  console.log(`[e2e] ${label}: confirmed, ${t?.meta?.computeUnitsConsumed ?? "?"} CU  ${sig}`);
  return sig;
}

async function main() {
  const mk = marketById(Number(process.env.MARKET ?? 0));
  const n = Number(process.env.RUNGS ?? 6);
  const notional = USD(Number(process.env.NOTIONAL ?? 500));
  const mints = readMints();
  const mint = mints.usdc;
  const tp = tokenProgramFor(mint, mints);
  const taker = keypair("taker");
  const maker = keypair("maker").publicKey;
  const p = program(taker);
  await ensureSol(taker.publicKey, CLUSTER === "devnet" ? 0.1 : 2);
  await topUpTokens(mints, mint, taker.publicKey, USD(100_000));

  // Taker short (USD earner) takes the maker-long USDC offer.
  const offer = offerPda(maker, BigInt(mk.id * 4));
  const o: any = await p.account.makerOffer.fetch(offer);
  const counter = BigInt(o.positionCounter.toString());
  const priceA = priceFeedPda(mk.feedA);
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: Math.min(1_400_000, 40_000 + CU_PER_TAKE * n) }));
  const positions = [];
  for (let i = 0; i < n; i++) {
    const tenor = Math.min(o.maxTenorDays, Math.max(o.minTenorDays, 30 * (i + 1)));
    const position = positionPda(offer, counter + BigInt(i));
    positions.push(position);
    tx.add(await p.methods.takeOffer(new BN(notional.toString()), tenor).accountsPartial({
      taker: taker.publicKey, config: configPda(), offer, market: marketPda(mk.id), demoState: demoPda(),
      rateBase: ratePda(mk.base), rateQuote: ratePda(mk.quote), position,
      priceA, priceB: mk.feedB ? priceFeedPda(mk.feedB) : priceA,
      mint, takerAta: getAssociatedTokenAddressSync(mint, taker.publicKey, false, tp),
      vault: vaultPda(mint), insurance: insurancePda(mint), tokenProgram: tp, systemProgram: SystemProgram.programId,
    }).instruction());
  }
  await sizeAndSend(`${n}-rung ladder ${mk.symbol}`, tx, [taker]);
  for (const pos of positions) {
    const a: any = await p.account.position.fetch(pos);
    const days = Math.round((a.maturity.toNumber() - a.openedAt.toNumber()) / 86_400);
    console.log(`[e2e]   ${pos.toBase58().slice(0, 8)} ${days}d strike=${(a.strike.toNumber() / 1e8).toFixed(4)} im/side=${a.imPerSide.toNumber() / 1e6}`);
  }

  if (process.env.RESET) {
    const admin = deployer();
    const pa = program(admin);
    const reset = new Transaction().add(await pa.methods.setDemoClock(new BN(0)).accountsPartial({ config: configPda(), admin: admin.publicKey }).instruction());
    for (const m of MARKETS) {
      reset.add(await pa.methods.setDemoPrice(m.id, new BN(0), new BN(0), false).accountsPartial({ config: configPda(), admin: admin.publicKey, demoState: demoPda() }).instruction());
    }
    await sizeAndSend("Dispatch reset (clock + 15 cleared slots)", reset, [admin]);
    const demo: any = await pa.account.demoState.fetch(demoPda());
    console.log(`[e2e] slots set after reset: ${demo.prices.filter((x: any) => x.set).length}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
