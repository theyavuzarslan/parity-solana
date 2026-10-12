"use client";

import { useState } from "react";
import { useParity, useParityQuery } from "@/data/provider";
import { cx, fmtNum, shortAddr } from "@/lib/format";
import { Button } from "./Button";

/** Wallet connect (mock or a real Solana wallet). Shows the address and test balances once connected. */
export function WalletButton({ compact }: { compact?: boolean }) {
  const { data } = useParity();
  const { value: w } = useParityQuery((d) => d.getWallet());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (w?.connected && w.address) {
    return (
      <div className="flex items-center gap-3">
        {!compact ? (
          <dl className="hidden items-baseline gap-3 text-right lg:flex">
            {(["USDC", "USDG"] as const).map((m) => (
              <div key={m}>
                <dt className="t-label text-xs text-navy-2">TEST {m}</dt>
                <dd className="t-num text-sm text-carbon">{fmtNum(w.balances[m], 2)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <button
          type="button"
          onClick={() => data.disconnect()}
          title={`Disconnect ${w.label ?? "wallet"}`}
          className={cx(
            "group flex h-10 items-center gap-2 rounded-[4px] border-2 border-navy bg-coupon px-3 transition-[background-color,transform] duration-150 hover:bg-hairline active:scale-[0.97]",
          )}
        >
          <span aria-hidden className="size-2 rounded-full bg-ok" />
          <span className="t-num text-sm text-navy">{shortAddr(w.address)}</span>
          <span className="t-label hidden max-w-32 truncate text-xs text-navy-2 sm:inline group-hover:hidden">{w.label?.includes("mock") ? "MOCK" : (w.label ?? "")}</span>
          <span className="t-label hidden text-xs text-navy-2 group-hover:inline">DISCONNECT</span>
        </button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      loadingLabel="Connecting…"
      error={err}
      onClick={async () => {
        setBusy(true);
        setErr(null);
        try {
          await data.connect();
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Could not connect.");
        } finally {
          setBusy(false);
        }
      }}
    >
      Connect wallet
    </Button>
  );
}
