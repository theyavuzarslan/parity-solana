/**
 * Wallet bridge: decouples the chain provider (plain object) from React wallet-adapter state.
 * <WalletBridgeSync> (inside <WalletProvider>) writes the connected wallet here; the provider
 * reads `current()` when it needs to sign and calls `requestConnect()` to open the picker.
 */
import type { Connection, PublicKey, Signer, Transaction } from "@solana/web3.js";

export interface BridgeWallet {
  publicKey: PublicKey;
  label: string;
  /** wallet-adapter sendTransaction: signs with the wallet (+ extra `signers`) and submits. */
  sendTransaction(tx: Transaction, connection: Connection, opts?: { signers?: Signer[] }): Promise<string>;
}

type Pending = { resolve: () => void; reject: (e: Error) => void };

export interface WalletBridge {
  current(): BridgeWallet | null;
  /** React side: publish the connected wallet (or null). */
  set(w: BridgeWallet | null): void;
  /** Provider side: ask the UI to connect; resolves once a wallet is connected. */
  requestConnect(): Promise<void>;
  /** React side: is the picker requested? */
  pickerOpen(): boolean;
  closePicker(reason?: string): void;
  /** React side registers the disconnect action. */
  setDisconnect(fn: () => Promise<void>): void;
  disconnect(): Promise<void>;
  subscribe(fn: () => void): () => void;
}

export function createWalletBridge(): WalletBridge {
  let wallet: BridgeWallet | null = null;
  let picker = false;
  let pending: Pending[] = [];
  let doDisconnect: () => Promise<void> = async () => {};
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    current: () => wallet,
    set(w) {
      const changed = w?.publicKey.toBase58() !== wallet?.publicKey.toBase58() || w?.label !== wallet?.label;
      wallet = w;
      if (w) {
        picker = false;
        const p = pending; pending = [];
        p.forEach((x) => x.resolve());
      }
      if (changed) emit();
    },
    requestConnect() {
      if (wallet) return Promise.resolve();
      picker = true;
      emit();
      return new Promise<void>((resolve, reject) => { pending.push({ resolve, reject }); });
    },
    pickerOpen: () => picker,
    closePicker(reason = "Wallet connection cancelled.") {
      picker = false;
      const p = pending; pending = [];
      p.forEach((x) => x.reject(new Error(reason)));
      emit();
    },
    setDisconnect(fn) { doDisconnect = fn; },
    async disconnect() { await doDisconnect(); wallet = null; emit(); },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

/** One bridge per page (the provider singleton and the React tree share it). */
export const walletBridge: WalletBridge = createWalletBridge();
