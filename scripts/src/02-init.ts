// initialize (signed by the program upgrade authority = deployer) and init_collateral x2. Idempotent.
// LIQ_GAP_SECS overrides liq_confirm_min_gap_secs (default 30; use a small value for a fast local E2E).
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  BN, CLUSTER, PROGRAM_ID, configPda, demoPda, deployer, exists, insurancePda, logStep, program,
  programDataPda, readMints, vaultPda,
} from "./env.js";

function riskParams() {
  return {
    openFeeBps: 10,
    makerFeeShareBps: 1000,
    liqPenaltyBps: 100,
    liquidatorRewardBps: 2000,
    partialLiqBps: 3000,
    callEquityBps: 5000,
    liqEquityBps: 2000,
    liqConfirmMarks: 3,
    liqConfirmMinGapSecs: new BN(Number(process.env.LIQ_GAP_SECS ?? 30)),
    maxPriceAgeSecs: new BN(60),
    maxConfBps: 50,
    minNotional: new BN(10_000_000),
  };
}

async function main() {
  const admin = deployer();
  const p = program(admin);
  const mints = readMints();
  console.log(`[02-init] cluster=${CLUSTER} admin=${admin.publicKey.toBase58()}`);

  if (await exists(configPda())) {
    const cfg: any = await p.account.config.fetch(configPda());
    logStep("initialize", "skip", `admin=${cfg.admin.toBase58()} gap=${cfg.params.liqConfirmMinGapSecs.toString()}s`);
  } else {
    const sig = await p.methods.initialize(riskParams()).accountsPartial({
      admin: admin.publicKey,
      program: PROGRAM_ID,
      programData: programDataPda(),
      config: configPda(),
      demoState: demoPda(),
      usdcMint: mints.usdc,
      usdgMint: mints.usdg,
      systemProgram: SystemProgram.programId,
    }).rpc();
    logStep("initialize", "done", sig);
  }

  for (const [label, mint, tp] of [
    ["USDC", mints.usdc, TOKEN_PROGRAM_ID],
    ["USDG", mints.usdg, TOKEN_2022_PROGRAM_ID],
  ] as const) {
    if (await exists(vaultPda(mint))) { logStep(`init_collateral ${label}`, "skip"); continue; }
    const sig = await p.methods.initCollateral().accountsPartial({
      config: configPda(), admin: admin.publicKey, mint, vault: vaultPda(mint), insurance: insurancePda(mint),
      tokenProgram: tp, systemProgram: SystemProgram.programId,
    }).rpc();
    logStep(`init_collateral ${label}`, "done", sig);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
