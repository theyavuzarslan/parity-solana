// Seed maker offers: per market one maker-long and one maker-short in USDC, and the same in USDG on
// the 5 demo markets. Spread 15 bps majors / 40 bps TRY, EM, metals; tenors 7–180 d; capacity $250k.
// Maker = keys/maker.json (SOL from the deployer, tokens minted by keys/faucet.json). Idempotent:
// nonce = market_id*4 + side*2 + mintIdx, and an existing offer PDA is skipped.
import { SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { topUpTokens } from "./tokens.js";
import {
  BN, CLUSTER, USD, configPda, ensureSol, exists, keypair, logStep, marketPda,
  offerPda, program, readMints, tokenProgramFor, vaultPda,
} from "./env.js";
import { MARKETS } from "./markets.js";

const CAPACITY = USD(250_000);
const MIN_TENOR = 7, MAX_TENOR = 180;
const MAKER_FLOAT = USD(5_000_000); // per mint; covers 30 USDC offers (~$30k each) with headroom

async function main() {
  const mints = readMints();
  const maker = keypair("maker");
  const p = program(maker);
  console.log(`[04-offers] cluster=${CLUSTER} maker=${maker.publicKey.toBase58()}`);
  await ensureSol(maker.publicKey, CLUSTER === "devnet" ? 0.3 : 5);
  await topUpTokens(mints, mints.usdc, maker.publicKey, MAKER_FLOAT);
  await topUpTokens(mints, mints.usdg, maker.publicKey, MAKER_FLOAT);

  let created = 0, skipped = 0;
  for (const mk of MARKETS) {
    for (const [mintIdx, mint] of [[0, mints.usdc], [1, mints.usdg]] as const) {
      if (mintIdx === 1 && !mk.demo) continue;
      for (const [sideIdx, side] of [[0, { long: {} }], [1, { short: {} }]] as const) {
        const nonce = BigInt(mk.id * 4 + sideIdx * 2 + mintIdx);
        const offer = offerPda(maker.publicKey, nonce);
        const label = `offer ${mk.symbol} maker-${sideIdx ? "short" : "long"} ${mintIdx ? "USDG" : "USDC"} n=${nonce}`;
        if (await exists(offer)) { skipped++; logStep(label, "skip", offer.toBase58()); continue; }
        const tp = tokenProgramFor(mint, mints);
        const sig = await p.methods
          .createOffer(new BN(nonce.toString()), mk.id, side, mk.spreadBps, MIN_TENOR, MAX_TENOR, new BN(CAPACITY.toString()))
          .accountsPartial({
            maker: maker.publicKey, config: configPda(), market: marketPda(mk.id), mint,
            makerAta: getAssociatedTokenAddressSync(mint, maker.publicKey, false, tp),
            vault: vaultPda(mint), offer, tokenProgram: tp, systemProgram: SystemProgram.programId,
          }).rpc();
        created++;
        logStep(label, "done", sig);
      }
    }
  }
  console.log(`[04-offers] created=${created} skipped=${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
