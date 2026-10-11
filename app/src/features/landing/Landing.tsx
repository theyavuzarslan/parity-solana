"use client";

import Link from "next/link";
import { useState } from "react";
import { marketConfig } from "@/data/markets";
import { useParity, useParityQuery } from "@/data/provider";
import type { Mint } from "@/data/types";
import { cx, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { PERSONAS } from "@/lib/personas";
import { Button } from "@/components/Button";
import { CarbonCopy, CopyLine } from "@/components/CarbonCopy";
import { Num } from "@/components/Num";
import { Orb } from "@/components/Orb";
import { Panel } from "@/components/Panel";
import { StatusChip } from "@/components/StatusChip";
import { WalletButton } from "@/components/WalletButton";
import { FAUCET_AMOUNT } from "@/data/mockProvider";

export function Landing() {
  const markets = useParityQuery((d) => d.getMarkets(), [], 30_000);
  const rates = useParityQuery((d) => d.getRates());
  const usdtry = markets.value?.find((m) => m.id === "USD/TRY");
  const rTry = rates.value?.find((r) => r.code === "TRY");
  const rUsd = rates.value?.find((r) => r.code === "USD");
  const dp = marketConfig("USD/TRY").dp;
  const board = (markets.value ?? []).filter((m) => ["USD/TRY", "EUR/TRY", "GAU/TRY", "EUR/USD", "XAU/USD"].includes(m.id));

  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-12 lg:grid-cols-12">
      {/* Promise */}
      <section className="min-w-0 lg:col-span-5" aria-labelledby="hero-t">
        <p className="t-label text-sm text-red">Rates you can hold, on Solana devnet</p>
        <h1 id="hero-t" className="t-display mt-3 text-3xl text-navy sm:text-4xl">
          Lock next month&rsquo;s lira today
        </h1>
        <p className="mt-5 max-w-[46ch] text-lg text-navy-2">
          Paid in dollars, spending in lira? Parity locks the exchange rate for each coming month as a coupon you hold. The price comes from the interest-rate gap, in the open.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/advisor"
            className="t-label inline-flex h-14 items-center rounded-[4px] border-2 border-red bg-red px-8 text-lg tracking-[0.08em] text-coupon transition-[background-color,transform] duration-150 hover:bg-red-press active:scale-[0.97]"
          >
            Ask the Advisor
          </Link>
          <Link
            href="/markets"
            className="t-label inline-flex h-14 items-center rounded-[4px] border-2 border-navy bg-coupon px-8 text-lg tracking-[0.08em] text-navy transition-[background-color,color,transform] duration-150 hover:bg-navy hover:text-coupon active:scale-[0.97]"
          >
            See 15 markets
          </Link>
        </div>

        <div className="mt-10">
          <Panel title="Live status" aside={<Link href="/markets" className="underline underline-offset-4 hover:text-navy">All markets</Link>}>
            <table className="w-full border-y-2 border-navy bg-coupon text-sm">
              <thead>
                <tr>
                  <th scope="col" className="t-label px-3 py-2 text-left text-xs text-navy-2">Market</th>
                  <th scope="col" className="t-label px-3 py-2 text-right text-xs text-navy-2">Spot</th>
                  <th scope="col" className="t-label hidden px-3 py-2 text-right text-xs text-navy-2 sm:table-cell">Fwd 90D</th>
                  <th scope="col" className="t-label px-3 py-2 text-left text-xs text-navy-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {board.map((m) => (
                  <tr key={m.id} className="border-t border-hairline">
                    <th scope="row" className="t-label px-3 py-2 text-left text-navy">{m.id}</th>
                    <td className="px-3 py-2 text-right"><span className="t-num text-carbon">{fmtPrice(m.spot, marketConfig(m.id).dp)}</span></td>
                    <td className="hidden px-3 py-2 text-right sm:table-cell"><span className="t-num text-navy">{fmtPrice(m.forwards[90], marketConfig(m.id).dp)}</span></td>
                    <td className="px-3 py-2"><StatusChip status={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </section>

      {/* Mechanism */}
      <section className="min-w-0 lg:col-span-4" aria-labelledby="mech-t">
        <Panel title="How the price is made" id="mech">
          <div className="coupon">
            <div className="flex items-stretch border-b-2 border-navy">
              <div className="t-label flex items-center bg-navy px-3 text-sm text-coupon">USD/TRY</div>
              <div className="t-label flex flex-1 items-center px-3 py-2 text-sm text-navy-2">Today → forward</div>
            </div>
            {usdtry && rTry && rUsd ? (
              <div className="px-4 py-4">
                <div className="flex items-baseline justify-between border-b border-hairline pb-3">
                  <span className="t-label text-sm text-navy">Spot today</span>
                  <Num className="text-3xl font-semibold">{fmtPrice(usdtry.spot, dp)}</Num>
                </div>
                <ol className="mt-1">
                  {([30, 90, 180] as const).map((t) => (
                    <li key={t} className="flex items-center justify-between gap-3 border-b border-hairline py-2.5">
                      <span className="t-label rounded-[3px] bg-red px-2 py-0.5 text-sm text-coupon">{t}D</span>
                      <span className="flex-1 border-t border-dashed border-navy/30" aria-hidden />
                      <Num className="text-xl">{fmtPrice(usdtry.forwards[t], dp)}</Num>
                      <span className="t-num w-16 text-right text-xs text-navy-2">{fmtPct((usdtry.forwards[t] / usdtry.spot - 1) * 100, 1, true)}</span>
                    </li>
                  ))}
                </ol>
                <p className="t-num mt-3 text-sm text-navy">F = S × (1 + r<sub>TRY</sub>·t) / (1 + r<sub>USD</sub>·t)</p>
                <p className="mt-2 text-sm text-navy-2">
                  Lira deposits earn <span className="t-num text-carbon">{fmtNum(rTry.ratePct, 2)}%</span> and dollar deposits <span className="t-num text-carbon">{fmtNum(rUsd.ratePct, 2)}%</span> a year (demo rates, to be verified), so a future dollar costs more lira than one today. The gap is the price of locking, not a dealer&rsquo;s guess.
                </p>
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center gap-3"><Orb label="Loading prices" size={32} state="connecting" /><span className="t-label text-sm text-navy-2">Fetching spot…</span></div>
            )}
          </div>
          <p className="mt-3 text-xs text-navy-2">
            Spot source: {usdtry?.source === "pyth" ? "Pyth (live)" : usdtry?.source === "demo-override" ? "demo override — demo mode is on" : "static demo spot (live feed unavailable)"}.
          </p>
        </Panel>
      </section>

      {/* Persona + setup */}
      <section className="min-w-0 space-y-8 lg:col-span-3" aria-labelledby="who-t">
        <Panel title="Who are you hedging for" id="who">
          <ul className="space-y-2">
            {PERSONAS.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/advisor?persona=${p.id}`}
                  className="group flex items-center justify-between gap-3 rounded-[4px] border-2 border-navy bg-coupon px-3 py-3 transition-[background-color,color,transform] duration-150 hover:bg-navy hover:text-coupon active:scale-[0.98]"
                >
                  <span className="min-w-0">
                    <span className="t-label block text-base">{p.title}</span>
                    <span className="block text-xs text-navy-2 group-hover:text-copy">{p.pairs.map((x) => x.market).join(" · ")}{p.proposed ? " · proposed future product" : ""}</span>
                  </span>
                  <span aria-hidden className="t-label text-lg text-red group-hover:text-coupon">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <SetupCard />
      </section>
    </div>
  );
}

function SetupCard() {
  const { data } = useParity();
  const wallet = useParityQuery((d) => d.getWallet());
  const [mint, setMint] = useState<Mint>("USDC");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const connected = wallet.value?.connected;
  return (
    <CarbonCopy title="Devnet setup" aside="TEST TOKENS">
      <ol className="space-y-4 text-sm">
        <li>
          <span className="t-label block">1 · Wallet</span>
          <div className="mt-2"><WalletButton compact /></div>
        </li>
        <li>
          <span className="t-label block">2 · Test collateral</span>
          <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Test token">
            {(["USDC", "USDG"] as const).map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={mint === x}
                onClick={() => { setMint(x); setState("idle"); }}
                className={cx("t-label h-8 rounded-t-[4px] border-2 border-b-0 px-3 text-xs transition-colors duration-150", mint === x ? "border-copy-ink bg-copy-ink text-copy" : "border-copy-ink/40 text-copy-ink hover:border-copy-ink")}
              >
                {x}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!connected}
              loading={state === "busy"}
              loadingLabel="Requesting…"
              success={state === "done" ? "SENT" : null}
              error={state === "error" ? "Faucet failed — try again." : null}
              onClick={async () => {
                setState("busy");
                try { await data.faucet(mint); setState("done"); } catch { setState("error"); }
              }}
            >
              Get {fmtNum(FAUCET_AMOUNT, 0)} test {mint}
            </Button>
          </div>
          {!connected ? <p className="mt-1.5 text-xs">Connect first; the faucet pays the connected wallet.</p> : null}
        </li>
      </ol>
      {connected && wallet.value ? (
        <dl className="mt-4">
          <CopyLine label="Test USDC" value={fmtNum(wallet.value.balances.USDC, 2)} />
          <CopyLine label="Test USDG" value={fmtNum(wallet.value.balances.USDG, 2)} />
        </dl>
      ) : null}
      <p className="mt-3 text-xs">Mock faucet and wallet for this preview; test tokens have no value.</p>
    </CarbonCopy>
  );
}
