/**
 * Provider selection: the chain provider when NEXT_PUBLIC_PROGRAM_ID is set AND its Config account
 * exists on the configured cluster; otherwise the mock ("Preview data" chip). The check is an RPC
 * call, so this returns a delegating provider that starts on the chain implementation (first paint
 * comes from `peek`, seeded synchronously) and swaps to the mock if the probe fails.
 */
import { PublicKey } from "@solana/web3.js";
import { walletBridge } from "@/chain/bridge";
import { createChainProvider, configExists } from "@/chain/chainProvider";
import { CHAIN } from "@/chain/config";
import { createMockProvider } from "./mockProvider";
import type { ParityData } from "./types";

export function createAutoProvider(): ParityData {
  const mock = createMockProvider();
  let programId: PublicKey | null = null;
  try { programId = CHAIN.programId ? new PublicKey(CHAIN.programId) : null; } catch { programId = null; }
  if (!programId) return mock;

  const chain = createChainProvider({ programId, bridge: walletBridge });
  let current: ParityData = chain;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  mock.subscribe(() => current === mock && notify());
  chain.subscribe(() => current === chain && notify());

  if (typeof window !== "undefined") {
    // Only a definite "no Config account" swaps to the mock. An RPC error (the public devnet RPC
    // answers bursts with 429) is retried and never drops a live deployment to preview data.
    const id = programId;
    const probe = (attempt: number): void => {
      configExists(id)
        .then((ok) => { if (!ok) { current = mock; notify(); } })
        .catch(() => { if (attempt < 6) setTimeout(() => probe(attempt + 1), 500 * 2 ** attempt); });
    };
    probe(0);
  }

  const d = (): ParityData => current;
  return {
    getMarkets: () => d().getMarkets(),
    getRates: () => d().getRates(),
    getOffers: (m) => d().getOffers(m),
    getPositions: (o) => d().getPositions(o),
    getWallet: () => d().getWallet(),
    getDemo: () => d().getDemo(),
    getDispatchLog: () => d().getDispatchLog(),
    getFeedHealth: () => d().getFeedHealth(),
    connect: () => d().connect(),
    disconnect: () => d().disconnect(),
    faucet: (m) => d().faucet(m),
    requestSol: () => d().requestSol(),
    quoteLadder: (r) => d().quoteLadder(r),
    preflight: (q) => d().preflight(q),
    lockLadder: (r, e) => d().lockLadder(r, e),
    addMargin: (id, a) => d().addMargin(id, a),
    lockedByMonth: (m, s) => d().lockedByMonth(m, s),
    demo: {
      setDemoMode: (on) => d().demo.setDemoMode(on),
      shock: (m, p) => d().demo.shock(m, p),
      advanceClock: (n) => d().demo.advanceClock(n),
      setRate: (c, r) => d().demo.setRate(c, r),
      markNow: () => d().demo.markNow(),
      liquidate: () => d().demo.liquidate(),
      settle: () => d().demo.settle(),
      reset: () => d().demo.reset(),
    },
    info: () => d().info!(),
    peek: {
      markets: () => d().peek!.markets(),
      rates: () => d().peek!.rates(),
    },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}
