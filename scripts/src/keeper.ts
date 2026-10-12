// Keeper: every KEEPER_INTERVAL_MS (5 s) fetch all positions and crank the live ones
// (Open / Called / PartiallyLiquidated) per decide(): settle when matured, else mark, and
// liquidate once breach_count >= config.params.liq_confirm_marks.
// Signs with keys/keeper.json (a dedicated wallet, so its reward account never collides with a
// party's payout account). Quietly skips the expected "not now" errors; logs every tx signature.
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
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
import { decide, isLive } from "./decide.js";
import { marketById } from "./markets.js";

export { decide, isLive };

const INTERVAL = Number(process.env.KEEPER_INTERVAL_MS ?? 5_000);
// Healthy (Open, no breach) positions are marked at most every KEEPER_HEALTHY_MARK_SECS to save fees;
// Called / breached / partially liquidated positions are marked every tick.
const HEALTHY_MARK_SECS = Number(process.env.KEEPER_HEALTHY_MARK_SECS ?? 15);
const lastMark = new Map<string, number>();
// Keeper SOL: top up to TARGET at startup; below MIN it logs loudly and re-funds from the deployer
// (if its key is present) on the periodic check.
const SOL_TARGET = Number(process.env.KEEPER_SOL_TARGET ?? (CLUSTER === "devnet" ? 0.3 : 2));
const SOL_MIN = Number(process.env.KEEPER_SOL_MIN ?? 0.05);
const SOL_CHECK_MS = Number(process.env.KEEPER_SOL_CHECK_MS ?? 60_000);
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
  const live = all.filter((x) => isLive(statusOf(x.account.status)));
  for (const { publicKey, account } of live) {
    const input = () => ({ confirmMarks: confirm, now, maturity: account.maturity.toNumber() });
    const plan = decide({ ...input(), status: statusOf(account.status), breachCount: account.breachCount });
    let pos = account;
    const healthy = statusOf(account.status) === "open" && account.breachCount === 0;
    if (plan.length === 1 && plan[0] === "mark" && healthy &&
      Date.now() - (lastMark.get(publicKey.toBase58()) ?? 0) < HEALTHY_MARK_SECS * 1000) continue;
    if (plan.includes("mark")) lastMark.set(publicKey.toBase58(), Date.now());
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

/** Balance check; below SOL_MIN tries to re-fund from the deployer. Returns the balance in SOL. Never throws. */
export async function checkSol(who: PublicKey, opts: { min: number; target: number }, log = console): Promise<number> {
  let bal = 0;
  try { bal = (await connection.getBalance(who, "confirmed")) / LAMPORTS_PER_SOL; }
  catch (e) { log.error(`[keeper] SOL balance check failed: ${(e as Error).message}`); return NaN; }
  if (bal >= opts.min) return bal;
  if (bal < SOL_MIN) log.error(`[keeper] !!! LOW SOL: keeper ${who.toBase58()} has ${bal.toFixed(4)} SOL (< ${SOL_MIN}); trying to re-fund from the deployer`);
  else log.log(`[keeper] topping up keeper from ${bal.toFixed(4)} to ${opts.target} SOL`);
  try {
    await ensureSol(who, opts.target);
    bal = (await connection.getBalance(who, "confirmed")) / LAMPORTS_PER_SOL;
    log.log(`[keeper] re-funded: ${bal.toFixed(4)} SOL`);
  } catch (e) {
    log.error(`[keeper] !!! re-fund failed (${(e as Error).message}); fund ${who.toBase58()} manually`);
  }
  return bal;
}

async function main() {
  const keeper = keypair("keeper");
  const p = program(keeper);
  const mints = readMints();
  console.log(`[keeper] cluster=${CLUSTER} keeper=${keeper.publicKey.toBase58()} interval=${INTERVAL}ms`);
  // Startup funding must not kill the keeper: continue if it already holds the minimum.
  const bal = await checkSol(keeper.publicKey, { min: SOL_TARGET, target: SOL_TARGET });
  if (!(bal >= SOL_MIN)) {
    console.error(`[keeper] cannot start: keeper ${keeper.publicKey.toBase58()} has ${Number.isNaN(bal) ? "unknown" : bal.toFixed(4)} SOL ` +
      `(< ${SOL_MIN}) and could not be funded from the deployer. Send it devnet SOL and restart.`);
    process.exit(1);
  }
  // Keeper's own reward accounts (caller_ata), one per collateral mint.
  const ixs = [mints.usdc, mints.usdg].map((mint) => {
    const tp = tokenProgramFor(mint, mints);
    return createAssociatedTokenAccountIdempotentInstruction(
      keeper.publicKey, getAssociatedTokenAddressSync(mint, keeper.publicKey, false, tp), keeper.publicKey, mint, tp);
  });
  await send(p, ixs, []);
  let lastSolCheck = Date.now();
  for (;;) {
    try { await tick(p, keeper, mints); } catch (e) { console.error(`[keeper] tick failed: ${(e as Error).message}`); }
    if (process.env.ONCE) return;
    if (Date.now() - lastSolCheck >= SOL_CHECK_MS) {
      lastSolCheck = Date.now();
      await checkSol(keeper.publicKey, { min: SOL_MIN, target: SOL_TARGET });
    }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
