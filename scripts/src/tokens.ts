import { PublicKey } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createMintToCheckedInstruction,
  getAssociatedTokenAddressSync, getAccount,
} from "@solana/spl-token";
import { connection, deployer, keypair, sendIxs, tokenProgramFor, type Mints } from "./env.js";

/** Mint `amount` of `mint` to `owner`'s ATA (created if missing) so its balance is at least `amount`. */
export async function topUpTokens(mints: Mints, mint: PublicKey, owner: PublicKey, amount: bigint) {
  const faucet = keypair("faucet");
  const payer = deployer();
  const tp = tokenProgramFor(mint, mints);
  const ata = getAssociatedTokenAddressSync(mint, owner, true, tp);
  let bal = 0n;
  try { bal = (await getAccount(connection, ata, "confirmed", tp)).amount; } catch { /* missing */ }
  if (bal >= amount) return ata;
  await sendIxs([
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, owner, mint, tp),
    createMintToCheckedInstruction(mint, ata, faucet.publicKey, amount - bal, 6, [], tp),
  ], [payer, faucet]);
  console.log(`  mint  ${(Number(amount - bal) / 1e6).toLocaleString()} to ${owner.toBase58().slice(0, 8)}… (${mint.equals(mints.usdg) ? "USDG" : "USDC"})`);
  return ata;
}

