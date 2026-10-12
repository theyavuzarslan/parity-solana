// Open a position as a demo taker (keys/taker.json): takes a seeded maker offer.
// Env: MARKET (id, default 0), TAKER_SIDE (long|short, default short = "sell USD" freelancer),
//      NOTIONAL (USD, default 10000), TENOR (days, default 30), MINT (usdc|usdg, default usdc).
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  BN, CLUSTER, USD, configPda, demoPda, ensureSol, insurancePda, keypair, marketPda, offerPda,
  positionPda, priceFeedPda, program, ratePda, readMints, tokenProgramFor, vaultPda,
} from "./env.js";
import { marketById } from "./markets.js";
import { topUpTokens } from "./tokens.js";

async function main() {
  const mk = marketById(Number(process.env.MARKET ?? 0));
  const takerLong = (process.env.TAKER_SIDE ?? "short") === "long";
  const notional = USD(Number(process.env.NOTIONAL ?? 10_000));
  const tenor = Number(process.env.TENOR ?? 30);
  const mints = readMints();
  const useUsdg = process.env.MINT === "usdg";
  const mint = useUsdg ? mints.usdg : mints.usdc;
  const tp = tokenProgramFor(mint, mints);

  const taker = keypair("taker");
  const maker = keypair("maker").publicKey;
  const p = program(taker);
  await ensureSol(taker.publicKey, CLUSTER === "devnet" ? 0.1 : 2);
  await topUpTokens(mints, mint, taker.publicKey, USD(100_000));

  // Taker short takes the maker-long offer and vice versa.
  const makerSideIdx = takerLong ? 1 : 0;
  const offer = offerPda(maker, BigInt(mk.id * 4 + makerSideIdx * 2 + (useUsdg ? 1 : 0)));
  const o: any = await p.account.makerOffer.fetch(offer);
  const position = positionPda(offer, BigInt(o.positionCounter.toString()));
  const priceA = priceFeedPda(mk.feedA);
  const sig = await p.methods.takeOffer(new BN(notional.toString()), tenor).accountsPartial({
    taker: taker.publicKey, config: configPda(), offer, market: marketPda(mk.id), demoState: demoPda(),
    rateBase: ratePda(mk.base), rateQuote: ratePda(mk.quote), position,
    priceA, priceB: mk.feedB ? priceFeedPda(mk.feedB) : priceA,
    mint, takerAta: getAssociatedTokenAddressSync(mint, taker.publicKey, false, tp),
    vault: vaultPda(mint), insurance: insurancePda(mint), tokenProgram: tp, systemProgram: SystemProgram.programId,
  }).rpc();
  const pos: any = await p.account.position.fetch(position);
  console.log(`[taker] opened ${mk.symbol} taker-${takerLong ? "long" : "short"} $${Number(notional) / 1e6} ${tenor}d ` +
    `position=${position.toBase58()} strike=${(pos.strike.toNumber() / 1e8).toFixed(4)} qty=${pos.qty.toString()} ` +
    `im/side=${pos.imPerSide.toNumber() / 1e6}  ${sig}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
