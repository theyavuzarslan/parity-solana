// fund_insurance: top each insurance account up to $25k (admin's tokens are minted by the faucet key). Idempotent.
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { BN, CLUSTER, USD, configPda, connection, deployer, insurancePda, logStep, program, readMints, tokenProgramFor } from "./env.js";
import { topUpTokens } from "./tokens.js";

const TARGET = USD(25_000);

async function main() {
  const admin = deployer();
  const p = program(admin);
  const mints = readMints();
  console.log(`[05-insurance] cluster=${CLUSTER}`);
  for (const [label, mint] of [["USDC", mints.usdc], ["USDG", mints.usdg]] as const) {
    const tp = tokenProgramFor(mint, mints);
    const bal = (await getAccount(connection, insurancePda(mint), "confirmed", tp)).amount;
    if (bal >= TARGET) { logStep(`fund_insurance ${label}`, "skip", `balance=${Number(bal) / 1e6}`); continue; }
    const amount = TARGET - bal;
    await topUpTokens(mints, mint, admin.publicKey, amount);
    const sig = await p.methods.fundInsurance(new BN(amount.toString())).accountsPartial({
      config: configPda(), admin: admin.publicKey, mint,
      adminToken: getAssociatedTokenAddressSync(mint, admin.publicKey, false, tp),
      insurance: insurancePda(mint), tokenProgram: tp,
    }).rpc();
    logStep(`fund_insurance ${label} +${Number(amount) / 1e6}`, "done", sig);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
