/**
 * Test-token faucet (server only). Mints FAUCET_AMOUNT test USDC + test USDG to the requester's
 * ATAs (created with each mint's own token program: SPL Token for USDC, Token-2022 for USDG),
 * signed by the devnet mint authority from FAUCET_SECRET_KEY (JSON array = keys/faucet.json).
 * Rate limit: once per wallet per 10 minutes, in memory (per server instance — on Vercel each
 * instance has its own map, so this is a courtesy limit, not a guarantee).
 */
import {
  Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createMintToCheckedInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export const FAUCET_AMOUNT = 1_000;
export const FAUCET_WINDOW_MS = 10 * 60_000;
const DECIMALS = 6;

export type MintTo = (owner: PublicKey) => Promise<string>;
export type FaucetReply = { status: number; body: Record<string, unknown> };

/** Pure request handling: validation + rate limit around an injectable `mintTo`. */
export function createFaucet(deps: { mintTo: MintTo; now?: () => number; windowMs?: number }) {
  const last = new Map<string, number>();
  const now = deps.now ?? (() => Date.now());
  const windowMs = deps.windowMs ?? FAUCET_WINDOW_MS;
  return {
    async handle(input: unknown): Promise<FaucetReply> {
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
      const prev = last.get(key);
      if (prev !== undefined && t - prev < windowMs) {
        const wait = Math.ceil((windowMs - (t - prev)) / 60_000);
        return { status: 429, body: { error: `This wallet already got test tokens. Try again in about ${wait} min.`, retryAfterSecs: Math.ceil((windowMs - (t - prev)) / 1000) } };
      }
      last.set(key, t); // reserve before the await so parallel requests cannot both pass
      try {
        const signature = await deps.mintTo(owner);
        return { status: 200, body: { signature, amount: FAUCET_AMOUNT, mints: ["USDC", "USDG"] } };
      } catch (e) {
        last.delete(key);
        return { status: 502, body: { error: `Faucet transaction failed: ${(e as Error).message}` } };
      }
    },
    reset() { last.clear(); },
  };
}

/** Real minting from env: FAUCET_SECRET_KEY, NEXT_PUBLIC_USDC_MINT, NEXT_PUBLIC_USDG_MINT, RPC. */
export function envMintTo(): MintTo {
  return async (owner) => {
    const secret = process.env.FAUCET_SECRET_KEY;
    const usdc = process.env.NEXT_PUBLIC_USDC_MINT;
    const usdg = process.env.NEXT_PUBLIC_USDG_MINT;
    if (!secret || !usdc || !usdg) throw new Error("faucet not configured (FAUCET_SECRET_KEY and mint addresses)");
    const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret) as number[]));
    const rpc = process.env.NEXT_PUBLIC_RPC_URL || (process.env.NEXT_PUBLIC_CLUSTER === "localnet" ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com");
    const connection = new Connection(rpc, "confirmed");
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
