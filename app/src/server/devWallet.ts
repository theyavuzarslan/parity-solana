/**
 * LOCALNET-ONLY dev signer behind /api/dev/wallet (keys/taker.json) and /api/dev/admin-wallet
 * (the deployer = config.admin on a local deploy). Refuses unless NEXT_PUBLIC_CLUSTER=localnet
 * (checked per request on the server) AND the request is addressed to localhost. Never logs keys.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Keypair, Transaction } from "@solana/web3.js";
import type { DevWho } from "@/chain/devWallet";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function devRefusal(req: Request): string | null {
  if (process.env.NEXT_PUBLIC_CLUSTER !== "localnet") return "The local test wallet only exists on localnet.";
  const host = new URL(req.url).hostname;
  if (!LOCAL_HOSTS.has(host)) return "The local test wallet only answers on localhost.";
  return null;
}

function keyPath(who: DevWho): string {
  if (who === "admin") return process.env.DEPLOYER_KEYPAIR ?? join(homedir(), ".config/solana/id.json");
  return process.env.DEV_TAKER_KEYPAIR ?? resolve(process.cwd(), "../keys/taker.json");
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
        t.partialSign(load(who));
        return json({ tx: t.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64") });
      } catch (e) {
        return json({ error: `Could not sign: ${(e as Error).message}` }, 400);
      }
    },
  };
}
