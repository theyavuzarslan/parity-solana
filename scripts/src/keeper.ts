// Keeper: every KEEPER_INTERVAL_MS (5 s) fetch all positions and crank the live ones
// (Open / Called / PartiallyLiquidated) per decide(): settle when matured, else mark, and
// liquidate once breach_count >= config.params.liq_confirm_marks.
// Signs with keys/keeper.json (a dedicated wallet, so its reward account never collides with a
// party's payout account). Quietly skips the expected "not now" errors; logs every tx signature.
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  ExtensionType, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createInitializeAccount3Instruction, getAccountLen, getAssociatedTokenAddressSync, getCpiGuard,
  getMemoTransfer, unpackAccount, getExtensionTypes, getMint,
} from "@solana/spl-token";
import { pathToFileURL } from "node:url";
import {
  CLUSTER, configPda, connection, demoPda, ensureSol, errorName, insurancePda, keypair, marketPda,
  priceFeedPda, program, ratePda, readMints, tokenProgramFor, vaultPda, type Mints,
} from "./env.js";
import { decide } from "./decide.js";
import { marketById } from "./markets.js";

export { decide };

const INTERVAL = Number(process.env.KEEPER_INTERVAL_MS ?? 5_000);
const QUIET = new Set(["MarketClosedOrStale", "StalePublishTime", "NotLiquidatable", "NotConfirmed", "NotMatured"]);

export type Payout = { address: PublicKey; ixs: TransactionInstruction[]; signers: Keypair[]; note: string };

/**
 * Payout account for `owner` in `mint` (liquidate/settle accept any token account of the mint owned
 * by the party; Token-2022 accounts with RequiredMemoTransfers or CpiGuard are rejected on-chain).
 * - canonical ATA missing            -> create it idempotently (keeper pays) and use it;
 * - ATA exists, owned by the party, no memo-required / CPI-guard -> use it;
 * - otherwise (owner reassigned, memo, CPI guard) -> create a fresh plain token account owned by the
 *   party in the same tx (new keypair, system create + InitializeAccount3, keeper pays).
 */
export async function resolvePayout(payer: PublicKey, owner: PublicKey, mint: PublicKey, tp: PublicKey): Promise<Payout> {
  const ata = getAssociatedTokenAddressSync(mint, owner, true, tp);
  const info = await connection.getAccountInfo(ata, "confirmed");
  if (!info) {
    return { address: ata, ixs: [createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint, tp)], signers: [], note: "create-ata" };
  }
  let usable = false;
  try {
    const acct = unpackAccount(ata, info, tp);
    const memo = tp.equals(TOKEN_2022_PROGRAM_ID) ? getMemoTransfer(acct) : null;
    const guard = tp.equals(TOKEN_2022_PROGRAM_ID) ? getCpiGuard(acct) : null;
    usable = acct.owner.equals(owner) && acct.mint.equals(mint) &&
      !(memo?.requireIncomingTransferMemos) && !(guard?.lockCpi);
  } catch { usable = false; }
  if (usable) return { address: ata, ixs: [], signers: [], note: "ata" };

  const fresh = Keypair.generate();
  let space = 165;
  if (tp.equals(TOKEN_2022_PROGRAM_ID)) {
    const mintInfo = await getMint(connection, mint, "confirmed", tp);
    const accountExts = getExtensionTypes(mintInfo.tlvData).flatMap((e) =>
      e === ExtensionType.TransferFeeConfig ? [ExtensionType.TransferFeeAmount] : []);
    space = getAccountLen(accountExts);
  }
  const lamports = await connection.getMinimumBalanceForRentExemption(space);
  return {
    address: fresh.publicKey,
    ixs: [
      SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: fresh.publicKey, space, lamports, programId: tp }),
      createInitializeAccount3Instruction(fresh.publicKey, mint, owner, tp),
    ],
    signers: [fresh],
    note: "fresh-account",
  };
}

function priceAccounts(marketId: number) {
  const mk = marketById(marketId);
  const a = priceFeedPda(mk.feedA);
  return { mk, priceA: a, priceB: mk.feedB ? priceFeedPda(mk.feedB) : a };
}

function riskAccounts(pos: any, address: PublicKey) {
  const { mk, priceA, priceB } = priceAccounts(pos.marketId);
  return {
    config: configPda(), position: address, market: marketPda(mk.id),
    rateBase: ratePda(mk.base), rateQuote: ratePda(mk.quote), demoState: demoPda(), priceA, priceB,
  };
}

async function send(p: any, ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
  return p.provider.sendAndConfirm(new Transaction().add(...ixs), signers);
}

const statusOf = (s: any) => Object.keys(s)[0];
const short = (k: PublicKey) => k.toBase58().slice(0, 8);

async function crank(p: any, keeper: Keypair, mints: Mints, address: PublicKey, pos: any, kind: "mark" | "settle" | "liquidate") {
  const tp = tokenProgramFor(pos.mint, mints);
  const sym = marketById(pos.marketId).symbol;
  if (kind === "mark") {
    const sig = await p.methods.mark().accountsPartial(riskAccounts(pos, address)).rpc();
    const fresh: any = await p.account.position.fetch(address);
    console.log(`[keeper] mark      ${short(address)} ${sym} status=${statusOf(fresh.status)} breach=${fresh.breachCount}  ${sig}`);
    return fresh;
  }
  const long = await resolvePayout(keeper.publicKey, pos.long, pos.mint, tp);
  const shortP = await resolvePayout(keeper.publicKey, pos.short, pos.mint, tp);
  const common = {
    ...riskAccounts(pos, address), mint: pos.mint, vault: vaultPda(pos.mint), insurance: insurancePda(pos.mint),
    longAta: long.address, shortAta: shortP.address, tokenProgram: tp,
  };
  const ix = kind === "settle"
    ? await p.methods.settle().accountsPartial(common).instruction()
    : await p.methods.liquidate().accountsPartial({
      ...common, caller: keeper.publicKey,
      callerAta: getAssociatedTokenAddressSync(pos.mint, keeper.publicKey, false, tp),
    }).instruction();
  const sig = await send(p, [...long.ixs, ...shortP.ixs, ix], [...long.signers, ...shortP.signers]);
  const after: any = await p.account.position.fetch(address);
  const notes = [long.note, shortP.note].filter((n) => n !== "ata").join(",");
  console.log(`[keeper] ${kind.padEnd(9)} ${short(address)} ${sym} -> ${statusOf(after.status)}${notes ? ` (payout: ${notes})` : ""}  ${sig}`);
  return after;
}

async function effectiveNow(p: any): Promise<{ now: number; confirm: number }> {
  const cfg: any = await p.account.config.fetch(configPda());
  const slot = await connection.getSlot("confirmed");
  const chain = (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  return { now: chain + (cfg.demoMode ? cfg.demoClockOffset.toNumber() : 0), confirm: cfg.params.liqConfirmMarks };
}

async function tick(p: any, keeper: Keypair, mints: Mints) {
  const { now, confirm } = await effectiveNow(p);
  const all: any[] = await p.account.position.all();
  const live = all.filter((x) => decide({ status: statusOf(x.account.status), breachCount: 0, confirmMarks: 1, now: 0, maturity: 1 }).length);
  for (const { publicKey, account } of live) {
    const input = () => ({ confirmMarks: confirm, now, maturity: account.maturity.toNumber() });
    const plan = decide({ ...input(), status: statusOf(account.status), breachCount: account.breachCount });
    let pos = account;
    for (const kind of plan) {
      try { pos = await crank(p, keeper, mints, publicKey, pos, kind); }
      catch (e) {
        const name = errorName(e);
        if (name && QUIET.has(name)) { if (process.env.KEEPER_VERBOSE) console.log(`[keeper] ${kind} ${short(publicKey)} skipped: ${name}`); }
        else console.error(`[keeper] ${kind} ${short(publicKey)} failed: ${name ?? (e as Error).message}`);
        break;
      }
    }
    // The mark may have just confirmed the breach: liquidate in the same tick.
    if (plan.length === 1 && plan[0] === "mark" && pos !== account) {
      const next = decide({ ...input(), status: statusOf(pos.status), breachCount: pos.breachCount });
      if (next.includes("liquidate")) {
        try { await crank(p, keeper, mints, publicKey, pos, "liquidate"); }
        catch (e) {
          const name = errorName(e);
          if (!(name && QUIET.has(name))) console.error(`[keeper] liquidate ${short(publicKey)} failed: ${name ?? (e as Error).message}`);
        }
      }
    }
  }
  if (process.env.KEEPER_VERBOSE) console.log(`[keeper] tick now=${now} live=${live.length}/${all.length}`);
}

async function main() {
  const keeper = keypair("keeper");
  const p = program(keeper);
  const mints = readMints();
  console.log(`[keeper] cluster=${CLUSTER} keeper=${keeper.publicKey.toBase58()} interval=${INTERVAL}ms`);
  await ensureSol(keeper.publicKey, CLUSTER === "devnet" ? 0.3 : 2);
  // Keeper's own reward accounts (caller_ata), one per collateral mint.
  const ixs = [mints.usdc, mints.usdg].map((mint) => {
    const tp = tokenProgramFor(mint, mints);
    return createAssociatedTokenAccountIdempotentInstruction(
      keeper.publicKey, getAssociatedTokenAddressSync(mint, keeper.publicKey, false, tp), keeper.publicKey, mint, tp);
  });
  await send(p, ixs, []);
  for (;;) {
    try { await tick(p, keeper, mints); } catch (e) { console.error(`[keeper] tick failed: ${(e as Error).message}`); }
    if (process.env.ONCE) return;
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
