/**
 * LOCAL DEV ONLY: a wallet-adapter whose key lives on the dev server (keys/taker.json, or the
 * deployer keypair for the admin variant). Transactions are signed by the dev API routes, whose
 * request-time server guard (server/devWallet.ts) refuses unless PARITY_DEV_WALLET=1, VERCEL is
 * unset, NODE_ENV is not production and the request is to localhost. The secret never reaches the
 * browser. The adapter is only listed when NEXT_PUBLIC_CLUSTER=localnet (a UI convenience, not a
 * security boundary).
 */
import { BaseSignerWalletAdapter, WalletNotConnectedError, WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { PublicKey, Transaction, type TransactionVersion, type VersionedTransaction } from "@solana/web3.js";

export type DevWho = "taker" | "admin";

const ICON = "data:image/svg+xml;base64," + (typeof btoa === "function"
  ? btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#444"/><text x="16" y="21" font-size="13" text-anchor="middle" fill="#fff" font-family="monospace">DEV</text></svg>')
  : "");

const toB64 = (u8: Uint8Array) => { let s = ""; u8.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class DevWalletAdapter extends BaseSignerWalletAdapter {
  name: WalletName<string>;
  url = "http://localhost";
  icon = ICON;
  readyState = WalletReadyState.Loadable;
  publicKey: PublicKey | null = null;
  connecting = false;
  supportedTransactionVersions: ReadonlySet<TransactionVersion> | null = null; // legacy only
  private route: string;

  constructor(who: DevWho) {
    super();
    this.name = (who === "admin" ? "Local admin (deployer)" : "Local test wallet") as WalletName<string>;
    this.route = who === "admin" ? "/api/dev/admin-wallet" : "/api/dev/wallet";
  }

  async connect(): Promise<void> {
    if (this.publicKey) return;
    this.connecting = true;
    try {
      const res = await fetch(this.route, { cache: "no-store" });
      const body = (await res.json()) as { publicKey?: string; error?: string };
      if (!res.ok || !body.publicKey) throw new Error(body.error ?? `dev wallet route ${res.status}`);
      this.publicKey = new PublicKey(body.publicKey);
      this.emit("connect", this.publicKey);
    } catch (e) {
      this.emit("error", e as never);
      throw e;
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this.publicKey = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (!this.publicKey) throw new WalletNotConnectedError();
    if (!(tx instanceof Transaction)) throw new Error("The local test wallet signs legacy transactions only.");
    const res = await fetch(this.route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tx: toB64(tx.serialize({ requireAllSignatures: false, verifySignatures: false })) }),
    });
    const body = (await res.json()) as { tx?: string; error?: string };
    if (!res.ok || !body.tx) throw new Error(body.error ?? `dev wallet route ${res.status}`);
    return Transaction.from(fromB64(body.tx)) as T;
  }
}
