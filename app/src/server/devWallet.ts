/**
 * LOCAL DEVELOPMENT ONLY: server-held signer behind /api/dev/wallet (keys/taker.json) and
 * /api/dev/admin-wallet (the deployer = config.admin on a local deploy). Never logs keys.
 *
 * The guard is evaluated per request from server-only env read with bracket access, so the
 * bundler cannot inline it at build time (NEXT_PUBLIC_* values ARE inlined, so they are not
 * trusted here). Every request is refused unless ALL of these hold:
 *   - PARITY_DEV_WALLET=1 is set in the server environment (opt-in, never set on Vercel);
 *   - VERCEL is unset (not running on Vercel);
 *   - NODE_ENV is not "production" (i.e. `next dev`);
 *   - the Host header and the request URL are both localhost.
 * Before signing, every instruction must target an allow-listed program.
 */
import "server-only";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { DevWho } from "@/chain/devWallet";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type Env = Record<string, string | undefined>;

/** Request-time guard. Returns the refusal reason, or null when the dev signer may answer. */
export function devRefusal(req: Request, env: Env = process.env): string | null {
  if (env["PARITY_DEV_WALLET"] !== "1") return "The local test wallet is disabled (set PARITY_DEV_WALLET=1 for local development).";
  if (env["VERCEL"]) return "The local test wallet never runs on Vercel.";
  if (env["NODE_ENV"] === "production") return "The local test wallet only runs under `next dev`.";
  // Both the Host header and the URL must be local (Next may build req.url from its bind address).
  const hostHeader = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  const urlHost = new URL(req.url).hostname;
  if (!LOCAL_HOSTS.has(hostHeader) || !LOCAL_HOSTS.has(urlHost)) return "The local test wallet only answers on localhost.";
  return null;
}

const DEFAULT_PROGRAM_ID = "55jabap7VG6LKKJtidxVRBuLaLzFz6P96uPUicR2e4EQ";

/** Programs the dev signer will sign for: Parity, System, SPL Token, Token-2022, ATA, Compute Budget. */
export function allowedPrograms(env: Env = process.env): Set<string> {
  const parity = new PublicKey(env["NEXT_PUBLIC_PROGRAM_ID"] || DEFAULT_PROGRAM_ID);
  return new Set([parity, SystemProgram.programId, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, ComputeBudgetProgram.programId].map((p) => p.toBase58()));
}

/** First instruction program outside the allow-list, or null. */
export function foreignProgram(tx: Transaction, allowed = allowedPrograms()): string | null {
  for (const ix of tx.instructions) if (!allowed.has(ix.programId.toBase58())) return ix.programId.toBase58();
  return null;
}

function keyPath(who: DevWho): string {
  if (who === "admin") return process.env["DEPLOYER_KEYPAIR"] ?? join(homedir(), ".config/solana/id.json");
  return process.env["DEV_TAKER_KEYPAIR"] ?? resolve(process.cwd(), "../keys/taker.json");
}

function load(who: DevWho): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(/*turbopackIgnore: true*/ keyPath(who), "utf8")) as number[]));
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export function devWalletHandlers(who: DevWho) {
  return {
    async GET(req: Request) {
      const no = devRefusal(req);
      if (no) return json({ error: no }, 403);
      try { return json({ publicKey: load(who).publicKey.toBase58() }); }
      catch { return json({ error: `No ${who} keypair found on the dev server.` }, 500); }
    },
    async POST(req: Request) {
      const no = devRefusal(req);
      if (no) return json({ error: no }, 403);
      try {
        const { tx } = (await req.json()) as { tx?: string };
        if (!tx) return json({ error: "Missing tx." }, 400);
        const t = Transaction.from(Buffer.from(tx, "base64"));
        const foreign = foreignProgram(t);
        if (foreign) return json({ error: `Refusing to sign: instruction for program ${foreign} is not allow-listed.` }, 400);
        t.partialSign(load(who));
        return json({ tx: t.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64") });
      } catch (e) {
        return json({ error: `Could not sign: ${(e as Error).message}` }, 400);
      }
    },
  };
}
