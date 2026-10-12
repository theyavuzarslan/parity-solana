/**
 * ParityData against the deployed Parity program (devnet or localnet).
 * Reads: Config, DemoState, Market, Rate, MakerOffer and the wallet's Position accounts; prices by
 * simulating `debug_price` (exactly what the program would use); wallet SOL/USDC/USDG balances.
 * Writes: ladder (one tx of N take_offer), add_margin, and admin Dispatch actions (demo mode,
 * shocks via set_demo_price at feed level, demo clock, rates, mark/liquidate/settle cranks).
 * Every write is signed through the wallet bridge, confirmed, then all reads are refetched.
 */
import { BN } from "@anchor-lang/core";
import * as web3 from "@solana/web3.js";
import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, type Signer, type TransactionInstruction } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { decide, isLive } from "shared/src/decide";
import { MARKETS as CHAIN_MARKETS, RATES as SHARED_RATES, type MarketMeta } from "shared/src/markets";
import { resolvePayout } from "shared/src/payout";
import { MARKETS, marketConfig, type FeedKey } from "@/data/markets";
import { createMockProvider } from "@/data/mockProvider";
import { carryPct, forwardFor, isPaused, marketStatus, strikeFor } from "@/data/pricing";
import { fetchLive, type LiveSnapshot } from "@/data/pyth";
import type {
  DemoState, DispatchEntry, FaucetResult, FeedHealth, LadderQuote, LadderRequest, LockResult, MarketId, MarketQuote,
  Mint, Offer, ParityData, Position, PositionStatus, Preflight, ProviderInfo, Rate, RateCode, RungQuote, Side, SpotSource, Tenor, Waterfall,
} from "@/data/types";
import type { WalletBridge } from "./bridge";
import { CHAIN, SOL_FAUCET_URL } from "./config";
import { buildLadderTx, bpsCeil, pickOffer, preflight as preflightLadder, requiredCollateral, type Leg, type OfferView, type Rung } from "./ladder";
import { pdas, priceFeedPda, code3 } from "./pda";
import { readOnchainPrices, type PriceReadView } from "./prices";
import { eventParser, makeProgram, programErrorName, type ParityProgram } from "./program";

const DAY = 86_400;
const TENORS: Tenor[] = [30, 90, 180];
const SNAP_TTL_MS = 4_000;
const QUIET = new Set(["MarketClosedOrStale", "StalePublishTime", "NotLiquidatable", "NotConfirmed", "NotMatured"]);
const POSITION_SPACE = 8 + 32 + 8 + 32 + 32 + 2 + 32 + 8 * 3 + 8 + 8 + 8 * 3 + 1 + 1 + 8 + 8 + 1;

const usdToUnits = (usd: number) => BigInt(Math.round(usd * 1e6));
const units = (x: { toString(): string } | bigint) => Number(x.toString()) / 1e6;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pad4 = (n: number) => String(n).padStart(4, "0");
const enumKey = (e: object) => Object.keys(e)[0] ?? "";
const STATUS: Record<string, PositionStatus> = { open: "Open", called: "Called", partiallyLiquidated: "PartiallyLiquidated", settled: "Settled", liquidated: "Liquidated" };
const rateCode = (bytes: number[]) => String.fromCharCode(...bytes.filter((b) => b !== 0));

type ConfigView = {
  admin: PublicKey; usdcMint: PublicKey; usdgMint: PublicKey; demoMode: boolean; demoClockOffset: number;
  params: { openFeeBps: number; makerFeeShareBps: number; partialLiqBps: number; callEquityBps: number; liqEquityBps: number; liqConfirmMarks: number; minNotional: bigint };
};
type Snap = {
  at: number;
  cfg: ConfigView;
  demo: { a: bigint; b: bigint; set: boolean }[];
  imBps: Map<number, number>;
  rates: Rate[];
  offers: OfferView[];
  prices: Map<number, PriceReadView>;
  insurance: Record<Mint, number>;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PositionAcct = any;

export interface ChainOptions {
  programId: PublicKey;
  bridge: WalletBridge;
  connection?: Connection;
}

export function createChainProvider(opts: ChainOptions): ParityData {
  const connection = opts.connection ?? new Connection(CHAIN.rpcUrl, "confirmed");
  const program: ParityProgram = makeProgram(connection, opts.programId);
  const P = pdas(opts.programId);
  const bridge = opts.bridge;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  bridge.subscribe(notify);

  // First paint (and server render): the mock's seeded ECB reference prices, offline.
  const seed = createMockProvider({ offline: true, seedDemoPositions: false });
  let snap: Snap | null = null;
  let loading: Promise<Snap> | null = null;
  let live: LiveSnapshot | null = null;
  let log: DispatchEntry[] = [];
  const shocks: Partial<Record<MarketId, number>> = {};
  const waterfalls = new Map<string, { waterfall?: Waterfall; pnlLong?: number } | null>();

  // ---------- snapshot ----------
  async function load(): Promise<Snap> {
    const [cfgRaw, demoRaw, marketsRaw, ratesRaw, offersRaw] = await Promise.all([
      program.account.config.fetch(P.config()),
      program.account.demoState.fetch(P.demo()),
      program.account.market.all(),
      program.account.rate.all(),
      program.account.makerOffer.all([{ memcmp: { offset: 113, bytes: "2" } }]), // active == 1
    ]);
    const cfg: ConfigView = {
      admin: cfgRaw.admin, usdcMint: cfgRaw.usdcMint, usdgMint: cfgRaw.usdgMint, demoMode: cfgRaw.demoMode,
      demoClockOffset: Number(cfgRaw.demoClockOffset.toString()),
      params: {
        openFeeBps: cfgRaw.params.openFeeBps, makerFeeShareBps: cfgRaw.params.makerFeeShareBps, partialLiqBps: cfgRaw.params.partialLiqBps,
        callEquityBps: cfgRaw.params.callEquityBps, liqEquityBps: cfgRaw.params.liqEquityBps, liqConfirmMarks: cfgRaw.params.liqConfirmMarks,
        minNotional: BigInt(cfgRaw.params.minNotional.toString()),
      },
    };
    const insBal = async (mint: PublicKey) => {
      try { return Number((await connection.getTokenAccountBalance(P.insurance(mint), "confirmed")).value.uiAmount ?? 0); } catch { return 0; }
    };
    const [prices, insUsdc, insUsdg] = await Promise.all([
      readOnchainPrices(program, connection, cfg.admin).catch(() => new Map<number, PriceReadView>()),
      insBal(cfg.usdcMint),
      insBal(cfg.usdgMint),
    ]);
    if (prices.size < CHAIN_MARKETS.length && (!live || Date.now() / 1000 - live.checkedAt > 30)) {
      live = await fetchLive().catch(() => null);
    }
    const now = Math.floor(Date.now() / 1000);
    const rates: Rate[] = ratesRaw.map(({ account: r }) => {
      const code = rateCode(r.code as number[]) as RateCode;
      return { code, ratePct: Number(r.rateBps.toString()) / 100, basis: r.basisDays as 360 | 365, updatedAt: Number(r.updatedAt.toString()) || now, source: `on-chain · ${SHARED_RATES.find((x) => x.code === code)?.source ?? "admin"}` };
    });
    const offers: OfferView[] = offersRaw.map(({ publicKey, account: o }) => ({
      pubkey: publicKey, maker: o.maker, marketId: o.marketId, makerSide: enumKey(o.makerSide) === "long" ? "long" : "short",
      spreadBps: o.spreadBps, minTenor: o.minTenorDays, maxTenor: o.maxTenorDays, capacityUsd: BigInt(o.capacityUsd.toString()),
      marginLocked: BigInt(o.marginLocked.toString()), positionCounter: BigInt(o.positionCounter.toString()), mint: o.mint, active: o.active,
    }));
    return {
      at: Date.now(), cfg,
      demo: demoRaw.prices.map((p: { a: BN; b: BN; set: boolean }) => ({ a: BigInt(p.a.toString()), b: BigInt(p.b.toString()), set: p.set })),
      imBps: new Map(marketsRaw.map(({ account: m }) => [m.id, m.imBps])),
      rates, offers, prices, insurance: { USDC: insUsdc, USDG: insUsdg },
    };
  }

  /** Fresh snapshot: awaits on first use, then serves the cache and refreshes in the background. */
  async function getSnap(force = false): Promise<Snap> {
    // A forced refresh (after a write) must not reuse a load that started before the write.
    if (force && loading) await loading.catch(() => undefined);
    const stale = !snap || Date.now() - snap.at > SNAP_TTL_MS;
    if ((force || stale) && !loading) {
      loading = load().then((s) => { snap = s; loading = null; if (!force) notify(); return s; }, (e) => { loading = null; throw e; });
      if (force || !snap) return loading;
    }
    if (!snap) return loading!;
    return snap;
  }

  const effNow = (s: Snap) => Math.floor(Date.now() / 1000) + (s.cfg.demoMode ? s.cfg.demoClockOffset : 0);
  const chainMeta = (id: MarketId): MarketMeta => CHAIN_MARKETS.find((m) => m.symbol === id)!;
  const mintName = (s: Snap, mint: PublicKey): Mint => (mint.equals(s.cfg.usdgMint) ? "USDG" : "USDC");
  const mintKey = (s: Snap, m: Mint) => (m === "USDG" ? s.cfg.usdgMint : s.cfg.usdcMint);
  const tokenProgramFor = (s: Snap, mint: PublicKey) => (mint.equals(s.cfg.usdgMint) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

  // ---------- quotes ----------
  function quoteFor(s: Snap, id: MarketId): MarketQuote & { upq: number } {
    const ui = marketConfig(id);
    const meta = chainMeta(id);
    const pr = s.prices.get(meta.id);
    let spot: number, source: SpotSource, publishTime: number, upq: number;
    if (pr) {
      spot = pr.spot; upq = pr.upq; publishTime = pr.publishTime;
      source = s.cfg.demoMode && s.demo[meta.id]?.set ? "demo-override" : "pyth";
    } else {
      // Fallback: the server price route (Pyth with a key, else ECB reference; metals demo).
      const lp = live?.prices ?? {};
      const feeds = ui.feeds as FeedKey[];
      const seedQ = seed.peek!.markets().find((q) => q.id === id)!;
      const have = feeds.every((f) => lp[f]);
      spot = have ? ui.compose(Object.fromEntries(Object.entries(lp).map(([k, v]) => [k, v!.price])) as Record<FeedKey, number>) : seedQ.spot;
      source = have ? (feeds.some((f) => lp[f]!.source === "ecb-ref") ? "ecb-ref" : "pyth") : seedQ.source === "demo-override" ? "demo-static" : seedQ.source;
      publishTime = have ? Math.min(...feeds.map((f) => lp[f]!.publishTime)) : seedQ.publishTime;
      upq = ui.quote === "USD" ? 1 : 1 / spot;
    }
    const status = marketStatus({ source, publishTime, nowSec: Math.floor(Date.now() / 1000) });
    const forwards = Object.fromEntries(TENORS.map((t) => [t, forwardFor(id, spot, s.rates, t)])) as Record<Tenor, number>;
    const mine = s.offers.filter((o) => o.marketId === meta.id);
    const best = mine.reduce<number | null>((a, o) => (a === null || o.spreadBps < a ? o.spreadBps : a), null);
    return {
      id, group: ui.group, base: ui.base, quote: ui.quote, spot, source, publishTime, status, forwards,
      carryPct: carryPct(id, s.rates), im: (s.imBps.get(meta.id) ?? meta.imBps) / 10_000, bestSpreadBps: best, upq,
    };
  }
  const allQuotes = (s: Snap) => MARKETS.map((m) => { const { upq: _u, ...q } = quoteFor(s, m.id); void _u; return q; });

  // ---------- wallet ----------
  async function walletState() {
    const w = bridge.current();
    if (!w) return { connected: false, address: null, label: null, balances: { USDC: 0, USDG: 0 } as Record<Mint, number>, solBalance: 0 };
    const s = await getSnap();
    const bal = async (mint: PublicKey) => {
      const ata = getAssociatedTokenAddressSync(mint, w.publicKey, true, tokenProgramFor(s, mint));
      try { return Number((await connection.getTokenAccountBalance(ata, "confirmed")).value.uiAmount ?? 0); } catch { return 0; }
    };
    const [usdc, usdg, lamports] = await Promise.all([bal(s.cfg.usdcMint), bal(s.cfg.usdgMint), connection.getBalance(w.publicKey, "confirmed").catch(() => 0)]);
    return { connected: true, address: w.publicKey.toBase58(), label: w.label, balances: { USDC: usdc, USDG: usdg } as Record<Mint, number>, solBalance: lamports / LAMPORTS_PER_SOL, lamports };
  }

  // ---------- positions ----------
  async function myPositionAccounts(): Promise<{ publicKey: PublicKey; account: PositionAcct }[]> {
    const w = bridge.current();
    if (!w) return [];
    const me = w.publicKey.toBase58();
    const [asLong, asShort] = await Promise.all([
      program.account.position.all([{ memcmp: { offset: 48, bytes: me } }]),
      program.account.position.all([{ memcmp: { offset: 80, bytes: me } }]),
    ]);
    const seen = new Map<string, { publicKey: PublicKey; account: PositionAcct }>();
    [...asLong, ...asShort].forEach((p) => seen.set(p.publicKey.toBase58(), p));
    return [...seen.values()];
  }

  /** Liquidated / Settled event of a closed position, decoded from its recent transactions. */
  async function closeEvent(address: PublicKey) {
    const key = address.toBase58();
    if (waterfalls.has(key)) return waterfalls.get(key) ?? undefined;
    try {
      const sigs = await connection.getSignaturesForAddress(address, { limit: 20 }, "confirmed");
      for (const { signature } of sigs) {
        const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        for (const ev of eventParser(program).parseLogs(tx?.meta?.logMessages ?? [])) {
          const name = ev.name.toLowerCase();
          if (name !== "liquidated" && name !== "settled") continue;
          const d = ev.data as { position: PublicKey; pnlLong: BN; fromLoser: BN; fromInsurance: BN; shortfall: BN };
          if (!d.position.equals(address)) continue;
          const fromLoser = units(d.fromLoser), fromIns = units(d.fromInsurance), shortfall = units(d.shortfall);
          const out = { pnlLong: units(d.pnlLong), waterfall: { owedUsd: round2(fromLoser + fromIns + shortfall), loserMarginUsd: fromLoser, insuranceUsd: fromIns, winnerHaircutUsd: shortfall } };
          waterfalls.set(key, out);
          return out;
        }
      }
    } catch { /* not cached: retried next read */ return undefined; }
    waterfalls.set(key, null);
    return undefined;
  }

  async function present(s: Snap, all: { publicKey: PublicKey; account: PositionAcct }[]): Promise<Position[]> {
    const me = bridge.current()?.publicKey;
    const n = (x: { toString(): string }) => Number(x.toString());
    const ordered = [...all].sort((a, b) => n(a.account.openedAt) - n(b.account.openedAt) || n(a.account.maturity) - n(b.account.maturity));
    const now = effNow(s);
    return Promise.all(ordered.map(async ({ publicKey, account: a }, i) => {
      const meta = CHAIN_MARKETS.find((m) => m.id === a.marketId)!;
      const id = meta.symbol as MarketId;
      const side: Side = me && a.long.equals(me) ? "long" : "short";
      const status = STATUS[enumKey(a.status)] ?? "Open";
      const q = quoteFor(s, id);
      const quantity = units(a.qty);
      const strike = Number(a.strike.toString()) / 1e8;
      const maturity = Number(a.maturity.toString());
      const opened = Number(a.openedAt.toString());
      const tauDays = Math.max(0, maturity - now) / DAY;
      const mark = forwardFor(id, q.spot, s.rates, tauDays);
      // Chain formula (math::pnl_long_usd): Q·(F_t − K)·upq / (1 + r_q·τ/B_q).
      const rq = s.rates.find((r) => r.code === meta.quote);
      const disc = rq ? 1 + (rq.ratePct / 100) * tauDays / rq.basis : 1;
      const pnlLongLive = (quantity * (mark - strike) * q.upq) / disc;
      const terminal = status === "Settled" || status === "Liquidated";
      const ev = terminal ? await closeEvent(publicKey) : undefined;
      const pnlLong = terminal ? (ev?.pnlLong ?? 0) : pnlLongLive;
      return {
        id: publicKey.toBase58(), no: pad4(i + 1), market: id, side,
        notionalUsd: units(a.notionalUsd), quantity, strike, openedAt: opened, maturity,
        tenorDays: Math.round((maturity - opened) / DAY), mint: mintName(s, a.mint), status,
        imUsd: units(a.imPerSide), marginUsd: units(side === "long" ? a.marginLong : a.marginShort),
        pnlUsd: round2(side === "long" ? pnlLong : -pnlLong),
        closedFraction: status === "PartiallyLiquidated" ? s.cfg.params.partialLiqBps / 10_000 : 0,
        markPrice: terminal ? q.spot : mark, waterfall: ev?.waterfall, demo: false,
      } satisfies Position;
    }));
  }

  // ---------- signing ----------
  function wallet() {
    const w = bridge.current();
    if (!w) throw new Error("Connect a wallet first.");
    return w;
  }

  async function send(ixs: TransactionInstruction[], signers: Signer[] = []): Promise<string> {
    const w = wallet();
    const tx = new Transaction().add(...ixs);
    return sendTx(tx, signers, w.publicKey);
  }

  async function sendTx(tx: Transaction, signers: Signer[] = [], payer?: PublicKey): Promise<string> {
    const w = wallet();
    tx.feePayer = payer ?? w.publicKey;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    let sig: string;
    try {
      sig = await w.sendTransaction(tx, connection, { signers });
    } catch (e) {
      throw friendly(e);
    }
    const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) {
      const t = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }).catch(() => null);
      throw friendly({ message: `Transaction ${sig} failed`, logs: t?.meta?.logMessages ?? [] });
    }
    return sig;
  }

  function friendly(e: unknown): Error {
    const name = programErrorName(e) ?? programErrorName((e as { error?: unknown })?.error);
    const msg = (e as Error)?.message ?? String(e);
    if (name) return Object.assign(new Error(`The program refused: ${name}.`), { code: name });
    if (/User rejected|rejected the request/i.test(msg)) return new Error("You cancelled the signature.");
    return new Error(msg);
  }

  async function afterWrite() {
    await getSnap(true).catch(() => undefined);
    notify();
  }

  // ---------- dispatch helpers ----------
  const entry = (action: string, effect: string): DispatchEntry => {
    const e = { id: `log-${log.length + 1}`, at: Date.now(), action, effect };
    log = [e, ...log].slice(0, 60);
    notify();
    return e;
  };
  const shortSig = (sig: string) => `${sig.slice(0, 8)}…`;

  async function requireAdmin(): Promise<Snap> {
    const s = await getSnap();
    const w = bridge.current();
    if (!w || !w.publicKey.equals(s.cfg.admin)) throw new Error(`Admin only: connect ${s.cfg.admin.toBase58().slice(0, 8)}… (config.admin).`);
    return s;
  }

  function riskAccounts(pos: PositionAcct, address: PublicKey) {
    const mk = CHAIN_MARKETS.find((m) => m.id === pos.marketId)!;
    const priceA = priceFeedPda(mk.feedA);
    return {
      config: P.config(), position: address, market: P.market(mk.id), rateBase: P.rate(mk.base), rateQuote: P.rate(mk.quote),
      demoState: P.demo(), priceA, priceB: mk.feedB ? priceFeedPda(mk.feedB) : priceA,
    };
  }

  /** mark / liquidate / settle one position, payout accounts resolved exactly like the keeper. */
  async function crank(s: Snap, kind: "mark" | "liquidate" | "settle", address: PublicKey, pos: PositionAcct): Promise<string> {
    if (kind === "mark") return send([await program.methods.mark().accountsPartial(riskAccounts(pos, address)).instruction()]);
    const caller = wallet().publicKey;
    const tp = tokenProgramFor(s, pos.mint);
    const longP = await resolvePayout({ web3, spl }, connection, caller, pos.long, pos.mint, tp);
    const shortP = await resolvePayout({ web3, spl }, connection, caller, pos.short, pos.mint, tp);
    const common = {
      ...riskAccounts(pos, address), mint: pos.mint, vault: P.vault(pos.mint), insurance: P.insurance(pos.mint),
      longAta: longP.address, shortAta: shortP.address, tokenProgram: tp,
    };
    const ixs: TransactionInstruction[] = [...longP.ixs, ...shortP.ixs];
    if (kind === "settle") {
      ixs.push(await program.methods.settle().accountsPartial(common).instruction());
    } else {
      const callerAta = getAssociatedTokenAddressSync(pos.mint, caller, false, tp);
      ixs.unshift(createAssociatedTokenAccountIdempotentInstruction(caller, callerAta, caller, pos.mint, tp));
      ixs.push(await program.methods.liquidate().accountsPartial({ ...common, caller, callerAta }).instruction());
    }
    return send(ixs, [...longP.signers, ...shortP.signers]);
  }

  async function crankAll(kind: "mark" | "liquidate" | "settle"): Promise<DispatchEntry> {
    const s = await requireAdmin();
    const now = Math.floor(Date.now() / 1000) + (s.cfg.demoMode ? s.cfg.demoClockOffset : 0);
    const all = await program.account.position.all();
    const done: string[] = [];
    let skipped = 0;
    for (const { publicKey, account } of all) {
      if (!isLive(enumKey(account.status))) continue;
      const plan = decide({ status: enumKey(account.status), breachCount: account.breachCount, confirmMarks: s.cfg.params.liqConfirmMarks, now, maturity: Number(account.maturity.toString()) });
      if (!plan.includes(kind)) { skipped += 1; continue; }
      try {
        const sig = await crank(s, kind, publicKey, account);
        const after = await program.account.position.fetch(publicKey);
        done.push(`${publicKey.toBase58().slice(0, 6)} → ${STATUS[enumKey(after.status)]}${kind === "mark" ? ` breach ${after.breachCount}` : ""} (${shortSig(sig)})`);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code && QUIET.has(code)) { skipped += 1; continue; }
        done.push(`${publicKey.toBase58().slice(0, 6)} failed: ${(e as Error).message}`);
      }
    }
    await afterWrite();
    const label = kind === "mark" ? "MARK NOW" : kind === "liquidate" ? "LIQUIDATE" : "SETTLE";
    return entry(label, done.length ? done.join(" · ") : `Nothing to ${kind} (${skipped} live position${skipped === 1 ? "" : "s"} not due).`);
  }

  // ---------- ladder ----------
  type Planned = { quote: LadderQuote; legs: (Leg | null)[]; meta: MarketMeta; mint: PublicKey };

  async function plan(req: LadderRequest): Promise<Planned> {
    const s = await getSnap();
    const meta = chainMeta(req.market);
    const q = quoteFor(s, req.market);
    const mint = mintKey(s, req.mint);
    const takerLong = req.side === "long";
    const imBps = s.imBps.get(meta.id) ?? meta.imBps;
    const params = { imBps, openFeeBps: s.cfg.params.openFeeBps, makerFeeShareBps: s.cfg.params.makerFeeShareBps, minNotional: s.cfg.params.minNotional };
    const offers = s.offers.filter((o) => o.marketId === meta.id);
    const rungs: Rung[] = req.rungs.map((r) => ({ tenorDays: r.tenorDays, notionalUsd: usdToUnits(r.amount) }));
    const single = pickOffer(offers, takerLong, mint, rungs, params);
    const legs = rungs.map((r) => {
      const o = single ?? pickOffer(offers, takerLong, mint, [r], params);
      return o ? { ...r, offer: o } : null;
    });
    const t0 = effNow(s);
    const quoteRungs: RungQuote[] = req.rungs.map((r, i) => {
      const leg = legs[i];
      const forward = forwardFor(req.market, q.spot, s.rates, r.tenorDays);
      const spreadBps = leg?.offer.spreadBps ?? 0;
      const strike = strikeFor(forward, req.side, spreadBps);
      const n = rungs[i].notionalUsd;
      const qty = r.amount / (q.spot * q.upq);
      return {
        ...r, forward, strike, notionalUsd: r.amount, spreadBps, offerId: leg?.offer.pubkey.toBase58() ?? null,
        marginUsd: units(bpsCeil(n, imBps)), feeUsd: units(bpsCeil(n, params.openFeeBps)),
        maturity: t0 + r.tenorDays * DAY, lockedQuote: qty * strike,
      };
    });
    const totalMarginUsd = round2(quoteRungs.reduce((a, r) => a + r.marginUsd, 0));
    const totalFeeUsd = round2(quoteRungs.reduce((a, r) => a + r.feeUsd, 0));
    return {
      quote: { market: req.market, side: req.side, mint: req.mint, rungs: quoteRungs, totalMarginUsd, totalFeeUsd, requiredUsd: round2(totalMarginUsd + totalFeeUsd), openFeeBps: params.openFeeBps, imPct: imBps / 100 },
      legs, meta, mint,
    };
  }

  async function check(p: Planned): Promise<Preflight> {
    const w = bridge.current();
    if (!w) return { ok: false, reason: "no-wallet" };
    const s = await getSnap();
    const ws = await walletState();
    const q = quoteFor(s, p.quote.market);
    const rent = await connection.getMinimumBalanceForRentExemption(POSITION_SPACE).catch(() => 2_500_000);
    const needLamports = rent * p.quote.rungs.length + 50_000;
    if ((ws.lamports ?? 0) < Math.max(needLamports, 10_000_000)) return { ok: false, reason: "need-sol" };
    if (isPaused(q.status)) return { ok: false, reason: "market-closed", status: q.status };
    if (p.legs.some((l) => !l)) return { ok: false, reason: "no-offer" };
    const imBps = Math.round(p.quote.imPct * 100);
    // Per offer: tenor, capacity, min notional, maker margin (pure plan-Task-11 preflight).
    const byOffer = new Map<string, Leg[]>();
    for (const l of p.legs as Leg[]) byOffer.set(l.offer.pubkey.toBase58(), [...(byOffer.get(l.offer.pubkey.toBase58()) ?? []), l]);
    for (const legs of byOffer.values()) {
      const r = preflightLadder({ rungs: legs, offer: legs[0].offer, collateralBalance: BigInt(Number.MAX_SAFE_INTEGER), solLamports: Number.MAX_SAFE_INTEGER, imBps, openFeeBps: p.quote.openFeeBps, minNotional: s.cfg.params.minNotional, makerFeeShareBps: s.cfg.params.makerFeeShareBps });
      if (!r.ok) return { ok: false, reason: "no-offer", detail: r.message };
    }
    const all = (p.legs as Leg[]).map(({ tenorDays, notionalUsd }) => ({ tenorDays, notionalUsd }));
    const need = requiredCollateral(all, imBps, p.quote.openFeeBps);
    const bal = usdToUnits(ws.balances[p.quote.mint]);
    if (bal < need) return { ok: false, reason: "need-tokens", requiredUsd: units(need), balanceUsd: ws.balances[p.quote.mint] };
    return { ok: true };
  }

  const provider: ParityData = {
    async getMarkets() { return allQuotes(await getSnap()); },
    async getRates() { return (await getSnap()).rates.map((r) => ({ ...r })); },
    async getOffers(market) {
      const s = await getSnap();
      return s.offers
        .map((o): Offer => ({
          id: o.pubkey.toBase58(), market: CHAIN_MARKETS.find((m) => m.id === o.marketId)!.symbol as MarketId, maker: o.maker.toBase58(),
          makerSide: o.makerSide, spreadBps: o.spreadBps, minTenorDays: o.minTenor, maxTenorDays: o.maxTenor, capacityUsd: units(o.capacityUsd),
          mint: mintName(s, o.mint), demo: true,
        }))
        .filter((o) => !market || o.market === market);
    },
    async getPositions() {
      const s = await getSnap();
      return (await present(s, await myPositionAccounts())).sort((a, b) => b.openedAt - a.openedAt);
    },
    async getWallet() { const { lamports: _l, ...w } = await walletState(); void _l; return w; },
    async getDemo(): Promise<DemoState> {
      const s = await getSnap();
      return { demoMode: s.cfg.demoMode, clockOffsetDays: round2(s.cfg.demoClockOffset / DAY), shocks: { ...shocks } };
    },
    async getDispatchLog() { return [...log]; },
    async getFeedHealth(): Promise<FeedHealth> {
      const s = await getSnap();
      const n = s.prices.size;
      return {
        live: n > 0,
        checkedAt: Math.floor(s.at / 1000),
        note: s.cfg.demoMode
          ? `On-chain prices for ${n}/15 markets (debug_price). Demo mode: admin-relayed reference prices.`
          : `On-chain Pyth prices for ${n}/15 markets; the rest use the server price route.`,
      };
    },

    async connect() { await bridge.requestConnect(); notify(); return provider.getWallet(); },
    async disconnect() { await bridge.disconnect(); notify(); return provider.getWallet(); },
    async faucet(mint): Promise<FaucetResult> {
      const w = wallet();
      const res = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ owner: w.publicKey.toBase58() }) });
      const body = (await res.json().catch(() => ({}))) as { signature?: string; error?: string; amount?: number };
      if (!res.ok || !body.signature) throw new Error(body.error ?? `Faucet failed (${res.status}).`);
      await connection.confirmTransaction(body.signature, "confirmed").catch(() => undefined);
      await afterWrite();
      const ws = await walletState();
      return { mint, amount: body.amount ?? 1_000, balance: ws.balances[mint], signature: body.signature };
    },
    async requestSol() {
      const w = wallet();
      if (CHAIN.cluster !== "localnet") {
        if (typeof window !== "undefined") window.open(SOL_FAUCET_URL, "_blank", "noopener");
        throw new Error(`Opened faucet.solana.com — request devnet SOL for ${w.publicKey.toBase58().slice(0, 8)}…, then come back.`);
      }
      const sig = await connection.requestAirdrop(w.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      notify();
      const bal = (await connection.getBalance(w.publicKey, "confirmed")) / LAMPORTS_PER_SOL;
      return { amount: 2, balance: bal, signature: sig };
    },

    async quoteLadder(req) { return (await plan(req)).quote; },
    async preflight(quote) {
      return check(await plan({ market: quote.market, side: quote.side, mint: quote.mint, rungs: quote.rungs.map(({ month, tenorDays, amount }) => ({ month, tenorDays, amount })) }));
    },
    async lockLadder(req): Promise<LockResult> {
      const p = await plan(req);
      const pf = await check(p);
      if (!pf.ok) throw new Error(`Preflight failed: ${pf.reason}${"detail" in pf && pf.detail ? ` — ${pf.detail}` : ""}`);
      const s = await getSnap();
      const w = wallet();
      const build = async (legs: Leg[]) => buildLadderTx(program, { taker: w.publicKey, market: p.meta, legs, tokenProgram: tokenProgramFor(s, p.mint) });
      let built = await build(p.legs as Leg[]);
      let sig: string;
      try {
        sig = await sendTx(built.tx);
      } catch (e) {
        // A position counter can move between quote and send (another taker): refetch and rebuild once.
        if (!/ConstraintSeeds|AccountAlreadyInUse|already in use/i.test((e as Error).message)) throw e;
        const fresh = await plan(req);
        built = await build(fresh.legs as Leg[]);
        sig = await sendTx(built.tx);
      }
      await afterWrite();
      const mine = await present(await getSnap(), await myPositionAccounts());
      const ids = new Set(built.positions.map((x) => x.toBase58()));
      entry("LOCK LADDER", `${ids.size} coupons on ${req.market} · tx ${shortSig(sig)}`);
      return { signature: sig, positions: mine.filter((x) => ids.has(x.id)) };
    },
    async addMargin(positionId, amountUsd) {
      const s = await getSnap();
      const w = wallet();
      const address = new PublicKey(positionId);
      const pos = await program.account.position.fetch(address);
      const side = pos.long.equals(w.publicKey) ? { long: {} } : { short: {} };
      const tp = tokenProgramFor(s, pos.mint);
      const sig = await send([await program.methods.addMargin(side, new BN(usdToUnits(amountUsd).toString())).accountsPartial({
        owner: w.publicKey, position: address, mint: pos.mint, ownerToken: getAssociatedTokenAddressSync(pos.mint, w.publicKey, false, tp),
        vault: P.vault(pos.mint), tokenProgram: tp,
      }).instruction()]);
      await afterWrite();
      entry("ADD MARGIN", `${positionId.slice(0, 6)} +$${amountUsd.toFixed(2)} · tx ${shortSig(sig)}`);
      const out = (await provider.getPositions()).find((x) => x.id === positionId);
      if (!out) throw new Error("Position not found after add_margin.");
      return out;
    },
    async lockedByMonth(market, side) {
      const out: Record<number, number> = {};
      const s = await getSnap();
      const t = effNow(s);
      for (const p of await provider.getPositions()) {
        if (p.market !== market || p.side !== side || p.status === "Settled" || p.status === "Liquidated" || p.maturity <= t) continue;
        const month = Math.min(6, Math.max(1, Math.round((p.maturity - t) / (30 * DAY))));
        out[month] = round2((out[month] ?? 0) + p.notionalUsd);
      }
      return out;
    },

    demo: {
      async setDemoMode(on) {
        await requireAdmin();
        const sig = await send([await program.methods.setDemoMode(on).accountsPartial({ config: P.config(), admin: wallet().publicKey, demoState: P.demo() }).instruction()]);
        await afterWrite();
        return entry(on ? "DEMO MODE ON" : "DEMO MODE OFF", `${on ? "Demo prices supersede Pyth" : "Pyth only; demo prices cleared"} · tx ${shortSig(sig)}`);
      },
      async shock(market, pct) {
        const s = await requireAdmin();
        if (!s.cfg.demoMode) return entry(`SHOCK ${market} ${pct > 0 ? "+" : ""}${pct}%`, "Refused — demo mode is off.");
        const meta = chainMeta(market);
        const pr = s.prices.get(meta.id);
        const slot = s.demo[meta.id];
        // set_demo_price takes FEED-level prices at 1e8. Scaling feed A scales the composed spot
        // by the same factor for every op (A, A×B, A÷B); feed B is kept.
        const a = slot?.set ? slot.a : pr?.a;
        const b = slot?.set ? slot.b : (pr?.b ?? 0n);
        if (!a) throw new Error(`No current price for ${market} to shock.`);
        const f = 1 + pct / 100;
        const a2 = BigInt(Math.round(Number(a) * f));
        const sig = await send([await program.methods.setDemoPrice(meta.id, new BN(a2.toString()), new BN(meta.feedB ? b.toString() : "0"), true)
          .accountsPartial({ config: P.config(), admin: wallet().publicKey, demoState: P.demo() }).instruction()]);
        shocks[market] = (shocks[market] ?? 1) * f;
        const prev = pr?.spot;
        await afterWrite();
        const next = (await getSnap()).prices.get(meta.id)?.spot;
        return entry(`SHOCK ${market} ${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`, `Spot ${prev?.toFixed(4) ?? "?"} → ${next?.toFixed(4) ?? "?"} (feed A ${Number(a) / 1e8} → ${Number(a2) / 1e8}) · tx ${shortSig(sig)}`);
      },
      async advanceClock(days) {
        const s = await requireAdmin();
        if (!s.cfg.demoMode) return entry(`CLOCK +${days}D`, "Refused — demo mode is off.");
        const offset = s.cfg.demoClockOffset + Math.round(days * DAY);
        const sig = await send([await program.methods.setDemoClock(new BN(offset)).accountsPartial({ config: P.config(), admin: wallet().publicKey }).instruction()]);
        await afterWrite();
        return entry(`CLOCK +${days}D`, `Protocol clock now +${round2(offset / DAY)} days · tx ${shortSig(sig)}`);
      },
      async setRate(code, ratePct) {
        const s = await requireAdmin();
        const before = s.rates.find((r) => r.code === code);
        const basis = before?.basis ?? SHARED_RATES.find((r) => r.code === code)?.basisDays ?? 365;
        const sig = await send([await program.methods.setRate(Array.from(code3(code)), new BN(Math.round(ratePct * 100)), basis)
          .accountsPartial({ config: P.config(), admin: wallet().publicKey, rate: P.rate(code) }).instruction()]);
        await afterWrite();
        return entry(`SET RATE ${code}`, `${before?.ratePct.toFixed(2)}% → ${ratePct.toFixed(2)}% · tx ${shortSig(sig)}`);
      },
      markNow: () => crankAll("mark"),
      liquidate: () => crankAll("liquidate"),
      settle: () => crankAll("settle"),
      async reset() {
        const s = await requireAdmin();
        const sig = await send([await program.methods.setDemoClock(new BN(0)).accountsPartial({ config: P.config(), admin: wallet().publicKey }).instruction()]);
        for (const k of Object.keys(shocks)) delete shocks[k as MarketId];
        await afterWrite();
        return entry("RESET", `Demo clock back to +0 · tx ${shortSig(sig)}. Shocked prices stay until the relay writes its next reference price${s.cfg.demoMode ? "" : ""}.`);
      },
    },

    async info(): Promise<ProviderInfo> {
      const s = await getSnap().catch(() => null);
      const w = bridge.current();
      return { kind: "chain", cluster: CHAIN.cluster, admin: s?.cfg.admin.toBase58() ?? null, isAdmin: !!(s && w && w.publicKey.equals(s.cfg.admin)), insurance: s ? { ...s.insurance } : undefined };
    },

    peek: {
      markets: () => (snap ? allQuotes(snap) : seed.peek!.markets()),
      rates: () => (snap ? snap.rates.map((r) => ({ ...r })) : seed.peek!.rates()),
    },

    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return provider;
}

/** True when the program's Config PDA exists on the configured cluster (provider selection). */
export async function configExists(programId: PublicKey, connection = new Connection(CHAIN.rpcUrl, "confirmed")): Promise<boolean> {
  const info = await connection.getAccountInfo(pdas(programId).config(), "confirmed");
  return !!info && info.owner.equals(programId);
}

