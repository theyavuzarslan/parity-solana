/**
 * Test-token faucet (server only). Mints FAUCET_AMOUNT test USDC + test USDG to the requester's
 * ATAs (created with each mint's own token program: SPL Token for USDC, Token-2022 for USDG),
 * signed by the devnet mint authority from FAUCET_SECRET_KEY (JSON array = keys/faucet.json).
 *
 * Drain protection (the faucet key pays ATA rent, so fresh throwaway wallets must not be free):
 *   1. the owner account must already exist on chain with ≥ MIN_OWNER_SOL (get devnet SOL from
 *      https://faucet.solana.com first);
 *   2. once per wallet per 10 minutes;
 *   3. at most IP_LIMIT_PER_WINDOW (5) requests per client IP (first x-forwarded-for hop) per 10
 *      minutes (relaxed so a demo room or office NAT can share one address);
 *   4. a global cap of GLOBAL_CAP_PER_HOUR successful requests per rolling hour.
 * Slots are reserved synchronously right after the checks (before any await) and released on
 * every failure path (403 low/missing SOL, 502), so a parallel burst cannot slip past them.
 * All limits are in memory, per server instance (on Vercel each instance has its own maps), so
 * they are a courtesy limit backed by the SOL requirement, not a guarantee.
 */
import "server-only";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createMintToCheckedInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";

/** Per request: this much test USDC and this much test USDG (enough for a 6-month ladder plus top-ups). */
export const FAUCET_AMOUNT = 10_000;
export const FAUCET_WINDOW_MS = 10 * 60_000;
export const IP_LIMIT_PER_WINDOW = 5;
export const MIN_OWNER_SOL = 0.01;
export const GLOBAL_CAP_PER_HOUR = 60;
const HOUR_MS = 60 * 60_000;
const DECIMALS = 6;

export type MintTo = (owner: PublicKey) => Promise<string>;
/** Owner balance in lamports, or null when the account does not exist. */
export type GetLamports = (owner: PublicKey) => Promise<number | null>;
export type FaucetReply = { status: number; body: Record<string, unknown> };

export const NEED_SOL_MESSAGE =
  `Get devnet SOL from faucet.solana.com first (at least ${MIN_OWNER_SOL} SOL in this wallet), then ask for test tokens again.`;

/** First hop of x-forwarded-for (the client as seen by the edge), else x-real-ip, else "unknown". */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Validation + limits around injectable chain access. */
export function createFaucet(deps: {
  mintTo: MintTo;
  getLamports: GetLamports;
  now?: () => number;
  windowMs?: number;
  globalCapPerHour?: number;
  ipLimit?: number;
  log?: (msg: string) => void;
}) {
  // Each reservation carries a unique token so a release only undoes its own slot.
  type Slot = { at: number; token: symbol };
  const byOwner = new Map<string, Slot>();
  const byIp = new Map<string, Slot[]>();
  let recent: Slot[] = [];
  const now = deps.now ?? (() => Date.now());
  const windowMs = deps.windowMs ?? FAUCET_WINDOW_MS;
  const cap = deps.globalCapPerHour ?? GLOBAL_CAP_PER_HOUR;
  const ipLimit = deps.ipLimit ?? IP_LIMIT_PER_WINDOW;
  const log = deps.log ?? ((m: string) => console.error(m));
  const wait = (since: number, t: number) => Math.ceil((windowMs - (t - since)) / 1000);

  return {
    async handle(input: unknown, ip = "unknown"): Promise<FaucetReply> {
      const ownerStr = (input as { owner?: unknown } | null)?.owner;
      let owner: PublicKey;
      try {
        if (typeof ownerStr !== "string") throw new Error();
        owner = new PublicKey(ownerStr);
      } catch {
        return { status: 400, body: { error: "Send { owner: <wallet address> }." } };
      }
      const key = owner.toBase58();
      const t = now();
      recent = recent.filter((x) => t - x.at < HOUR_MS);
      if (recent.length >= cap) {
        return { status: 429, body: { error: "The faucet is busy — it has handed out its hourly allowance. Try again later.", retryAfterSecs: Math.ceil((HOUR_MS - (t - recent[0]!.at)) / 1000) } };
      }
      const prevOwner = byOwner.get(key);
      if (prevOwner !== undefined && t - prevOwner.at < windowMs) {
        const s = wait(prevOwner.at, t);
        return { status: 429, body: { error: `This wallet already got test tokens. Try again in about ${Math.ceil(s / 60)} min.`, retryAfterSecs: s } };
      }
      const ipSlots = (byIp.get(ip) ?? []).filter((x) => t - x.at < windowMs);
      byIp.set(ip, ipSlots);
      if (ipSlots.length >= ipLimit) {
        const s = wait(ipSlots[0]!.at, t);
        return { status: 429, body: { error: `This network already got test tokens ${ipLimit} times in the last 10 minutes. Try again in about ${Math.ceil(s / 60)} min.`, retryAfterSecs: s } };
      }

      // Reserve the owner, IP and global slots NOW — synchronously after the checks and before
      // any await — so concurrent requests see them. Every non-200 exit below releases them.
      const slot: Slot = { at: t, token: Symbol("faucet") };
      byOwner.set(key, slot);
      ipSlots.push(slot);
      recent.push(slot);
      const release = () => {
        if (byOwner.get(key)?.token === slot.token) byOwner.delete(key);
        const left = (byIp.get(ip) ?? []).filter((x) => x.token !== slot.token);
        if (left.length) byIp.set(ip, left); else byIp.delete(ip);
        recent = recent.filter((x) => x.token !== slot.token);
      };

      let lamports: number | null;
      try {
        lamports = await deps.getLamports(owner);
      } catch (e) {
        release();
        log(`[faucet] balance lookup failed for ${key}: ${(e as Error).message}`);
        return { status: 502, body: { error: "The faucet could not reach the network. Try again in a minute." } };
      }
      if (lamports === null || lamports < MIN_OWNER_SOL * LAMPORTS_PER_SOL) {
        release();
        return { status: 403, body: { error: NEED_SOL_MESSAGE, needSol: MIN_OWNER_SOL, solFaucet: "https://faucet.solana.com" } };
      }
      try {
        const signature = await deps.mintTo(owner);
        return { status: 200, body: { signature, amount: FAUCET_AMOUNT, mints: ["USDC", "USDG"] } };
      } catch (e) {
        release();
        log(`[faucet] mint for ${key} failed: ${(e as Error).message}`);
        return { status: 502, body: { error: "The faucet transaction failed. Try again in a minute." } };
      }
    },
    reset() { byOwner.clear(); byIp.clear(); recent = []; },
  };
}

function rpcUrl(): string {
  return process.env["NEXT_PUBLIC_RPC_URL"] || (process.env["NEXT_PUBLIC_CLUSTER"] === "localnet" ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com");
}

export function envGetLamports(): GetLamports {
  return async (owner) => {
    const info = await new Connection(rpcUrl(), "confirmed").getAccountInfo(owner, "confirmed");
    return info ? info.lamports : null;
  };
}

/** Real minting from env: FAUCET_SECRET_KEY, NEXT_PUBLIC_USDC_MINT, NEXT_PUBLIC_USDG_MINT, RPC. */
export function envMintTo(): MintTo {
  return async (owner) => {
    const secret = process.env["FAUCET_SECRET_KEY"];
    const usdc = process.env["NEXT_PUBLIC_USDC_MINT"];
    const usdg = process.env["NEXT_PUBLIC_USDG_MINT"];
    if (!secret || !usdc || !usdg) throw new Error("faucet not configured (FAUCET_SECRET_KEY and mint addresses)");
    const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret) as number[]));
    const connection = new Connection(rpcUrl(), "confirmed");
    const tx = new Transaction();
    for (const m of [usdc, usdg]) {
      const mint = new PublicKey(m);
      const info = await connection.getAccountInfo(mint, "confirmed");
      if (!info) throw new Error(`mint ${m} not found`);
      const tp = info.owner; // SPL Token or Token-2022, whichever owns the mint
      const ata = getAssociatedTokenAddressSync(mint, owner, true, tp);
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, ata, owner, mint, tp),
        createMintToCheckedInstruction(mint, ata, authority.publicKey, BigInt(FAUCET_AMOUNT) * 10n ** BigInt(DECIMALS), DECIMALS, [], tp),
      );
    }
    return sendAndConfirmTransaction(connection, tx, [authority], { commitment: "confirmed" });
  };
}
