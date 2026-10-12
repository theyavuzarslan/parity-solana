"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { WalletReadyState, type Adapter, type WalletName } from "@solana/wallet-adapter-base";
import { WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { walletBridge } from "@/chain/bridge";
import { isLocalnet } from "@/chain/config";
import { DevWalletAdapter } from "@/chain/devWallet";
import { Button } from "./Button";

/**
 * Wallet layer for the chain provider: wallet-standard autodetect (Phantom, Solflare, Backpack …),
 * plus — on localnet only — the server-held test wallets. Publishes the connected wallet to the
 * bridge the provider signs through, and shows a small picker when the provider asks to connect.
 */
export function ChainWallet({ children }: { children: ReactNode }) {
  const wallets = useMemo<Adapter[]>(() => (isLocalnet() ? [new DevWalletAdapter("taker"), new DevWalletAdapter("admin")] : []), []);
  return (
    <WalletProvider wallets={wallets} autoConnect localStorageKey="parity-wallet">
      <BridgeSync />
      <WalletPicker />
      {children}
    </WalletProvider>
  );
}

function BridgeSync() {
  const { publicKey, wallet, connected, sendTransaction, disconnect } = useWallet();
  useEffect(() => {
    walletBridge.setDisconnect(async () => { await disconnect(); });
  }, [disconnect]);
  useEffect(() => {
    if (connected && publicKey && wallet) {
      walletBridge.set({ publicKey, label: wallet.adapter.name, sendTransaction: (tx, c, o) => sendTransaction(tx, c, o) });
    } else {
      walletBridge.set(null);
    }
  }, [connected, publicKey, wallet, sendTransaction]);
  return null;
}

const INSTALL = [
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Solflare", url: "https://solflare.com/download" },
  { name: "Backpack", url: "https://backpack.app/download" },
];

function WalletPicker() {
  const open = useSyncExternalStore(walletBridge.subscribe, walletBridge.pickerOpen, () => false);
  const { wallets, wallet, select, connect, connected, connecting } = useWallet();
  const [pending, setPending] = useState<WalletName | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const usable = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);

  useEffect(() => {
    if (!pending || !wallet || wallet.adapter.name !== pending || connected || connecting) return;
    connect().then(
      () => setPending(null),
      (e: unknown) => { setErr(e instanceof Error ? e.message : "Could not connect."); setPending(null); },
    );
  }, [pending, wallet, connected, connecting, connect]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="wallet-picker-t" className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-[10px] border-2 border-navy bg-coupon p-5 shadow-[var(--ticket-drop)]">
        <h2 id="wallet-picker-t" className="t-display text-2xl text-navy">Connect a wallet</h2>
        <p className="mt-1 text-sm text-navy-2">Solana devnet · test tokens only.</p>
        <ul className="mt-4 space-y-2">
          {usable.map((w) => (
            <li key={w.adapter.name}>
              <button
                type="button"
                onClick={() => { setErr(null); setPending(w.adapter.name); select(w.adapter.name); }}
                className="flex h-12 w-full items-center gap-3 rounded-[4px] border-2 border-navy bg-coupon px-3 text-left text-navy transition-colors duration-150 hover:bg-hairline"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.adapter.icon} alt="" className="size-6" />
                <span className="t-label text-sm">{w.adapter.name}</span>
                {pending === w.adapter.name ? <span className="ml-auto text-xs text-navy-2">Connecting…</span> : null}
              </button>
            </li>
          ))}
        </ul>
        {usable.length === 0 ? (
          <p className="mt-2 text-sm text-navy-2">
            No Solana wallet found in this browser. Install{" "}
            {INSTALL.map((x, i) => (
              <span key={x.name}>
                <a className="underline" href={x.url} target="_blank" rel="noreferrer">{x.name}</a>{i < INSTALL.length - 1 ? ", " : ""}
              </span>
            ))}{" "}and switch it to devnet.
          </p>
        ) : null}
        {err ? <p role="alert" className="mt-3 text-sm text-red">{err}</p> : null}
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => { setPending(null); walletBridge.closePicker(); }}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
