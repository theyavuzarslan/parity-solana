/**
 * Mock implementation of ParityData. Prices are live from Pyth when the feed
 * answers, otherwise labelled demo spots. Wallet, offers, positions,
 * signatures and the dispatch crank are simulated in memory and labelled
 * "demo" / "mock" in the UI. State lives for the browser session (lost on a
 * hard reload) — the chain provider replaces all of it with devnet accounts.
 */
import { DEMO_ONLY_FEEDS, DEMO_SPOTS, FEEDS, MARKETS, marketConfig, PROTOCOL, refDateToSec, SEED_RATES, SEED_REF_DATE, type FeedKey } from "./markets";
import { carryPct, forwardFor, isPaused, marketStatus, pnlUsd, strikeFor, usdPerQuote } from "./pricing";
import { fetchLive, type LiveSnapshot } from "./pyth";
import type {
  DemoState, DispatchEntry, FaucetResult, FeedHealth, LadderQuote, LadderRequest, LockResult,
  MarketId, MarketQuote, MarketStatus, Mint, Offer, ParityData, Position, Preflight, Rate, RateCode, RungQuote, Side, SpotSource, Tenor,
} from "./types";

const DAY = 86_400;
const TENORS: Tenor[] = [30, 90, 180];
const LIVE_TTL_SECS = 30;
/** Mirrors server/faucet.ts: 10,000 test tokens per mint per request. */
export const FAUCET_AMOUNT = 10_000;
const LIQ_CONFIRM_MARKS = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;
const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function fakeBase58(len: number, rnd: () => number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += B58[Math.floor(rnd() * B58.length)];
  return s;
}
/** Small deterministic PRNG so demo ids are stable between renders and tests. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface InternalPosition extends Omit<Position, "pnlUsd" | "markPrice"> {
  breachCount: number;
  /** seeded demo history (No. 0001–0005): only visible while demo mode is on */
  history?: boolean;
  /** frozen result for terminal positions */
  finalPnlUsd?: number;
  finalMark?: number;
}

export interface MockOptions {
  /** start with demo mode on (default false — real/reference prices on load; Dispatch turns it on) */
  demoMode?: boolean;
  /** starting mock wallet balances */
  balances?: Partial<Record<Mint, number>>;
  connected?: boolean;
  /** starting test SOL (default 1 when `connected` is passed, else 0 — connect() alone brings none) */
  sol?: number;
  /** seed the five demo-history coupons, shown while demo mode is on (default true) */
  seedDemoPositions?: boolean;
  /** replace the demo maker book (tests: "no seats" rungs) */
  offers?: Offer[];
  /** force a market status (tests: CLOSED / STALE states) */
  forceStatus?: Partial<Record<MarketId, MarketStatus>>;
  /** disable network polling (tests) */
  offline?: boolean;
  /** injectable clock, ms */
  now?: () => number;
}

export function createMockProvider(opts: MockOptions = {}): ParityData & { _debug: () => unknown } {
  const realNow = opts.now ?? (() => Date.now());
  const rnd = mulberry32(0xc910bf11);
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const startSec = Math.floor(realNow() / 1000);
  let rates: Rate[] = SEED_RATES.map((r) => ({ ...r, updatedAt: startSec }));
  let demo: DemoState = { demoMode: opts.demoMode ?? false, clockOffsetDays: 0, shocks: {} };
  // Seeded synchronously: ECB reference rates of SEED_REF_DATE for FX (REF), metals stay demo.
  const seedPrices = Object.fromEntries(
    (Object.keys(FEEDS) as FeedKey[])
      .filter((k) => !DEMO_ONLY_FEEDS.includes(k))
      .map((k) => [k, { price: DEMO_SPOTS[k], publishTime: refDateToSec(SEED_REF_DATE), source: "ecb-ref" as const }]),
  ) as LiveSnapshot["prices"];
  let live: LiveSnapshot = { ok: true, provider: "ecb", prices: seedPrices, checkedAt: 0, note: `Seeded ECB reference rates of ${SEED_REF_DATE} — refreshing…` };
  let livePending: Promise<void> | null = null;
  let wallet = {
    connected: opts.connected ?? false,
    address: opts.connected ? fakeBase58(44, rnd) : (null as string | null),
    label: opts.connected ? "Demo wallet (mock)" : (null as string | null),
    balances: { USDC: opts.balances?.USDC ?? 0, USDG: opts.balances?.USDG ?? 0 } as Record<Mint, number>,
    solBalance: opts.sol ?? (opts.connected ? 1 : 0),
  };
  let log: DispatchEntry[] = [];
  let positions: InternalPosition[] | null = null;
  let counter = 5;

  const nowSec = () => Math.floor(realNow() / 1000) + demo.clockOffsetDays * DAY;

  // ---------- Offers (demo makers) ----------
  // Demo maker book. Makers selling USD/TRY forward (an importer's counterparty) and
  // gram-gold makers only quote out to 150 days, so a 6-month ladder there prints a
  // "no seats" rung — the empty state the Advisor has to handle honestly.
  const offers: Offer[] = opts.offers ?? MARKETS.flatMap((m, i) => {
    const base = m.group === "Lira" || m.group === "Gold" ? 25 : m.group === "EM peers" ? 18 : 8;
    return (["long", "short"] as Side[]).map((makerSide, j) => ({
      id: `offer-${i + 1}-${j + 1}`,
      market: m.id,
      maker: j === 0 ? "Demo maker A" : "Demo maker B",
      makerSide,
      spreadBps: base + (j === 0 ? 0 : 5) + (i % 3) * 2,
      minTenorDays: 1,
      maxTenorDays: (m.id === "USD/TRY" && makerSide === "short") || m.id === "GAU/TRY" ? 150 : 365,
      capacityUsd: m.group === "Lira" ? 50_000 : 20_000,
      mint: j === 0 ? "USDC" : "USDG",
      demo: true as const,
    }));
  });

  // ---------- Prices ----------
  /**
   * Never awaited by reads: the seeded snapshot answers immediately and fresh
   * prices overlay it when the route handler answers (then listeners refetch).
   */
  function refreshLive(force = false) {
    if (opts.offline) return;
    const now = Math.floor(Date.now() / 1000);
    if (!force && now - live.checkedAt < LIVE_TTL_SECS) return;
    if (livePending) return;
    live = { ...live, checkedAt: now };
    livePending = fetchLive().then((snap) => {
      // overlay: keep the previous (seeded or last good) prices for feeds a poll did not return
      live = snap.ok
        ? { ...snap, prices: { ...live.prices, ...snap.prices } }
        : { ...live, checkedAt: snap.checkedAt, note: `${snap.note} Showing the last reference rates.` };
      livePending = null;
      notify();
    });
  }

  function feedSpots(): { spots: Record<FeedKey, number>; publish: Record<FeedKey, number | null>; src: Record<FeedKey, "pyth" | "ecb-ref" | null> } {
    const spots = {} as Record<FeedKey, number>;
    const publish = {} as Record<FeedKey, number | null>;
    const src = {} as Record<FeedKey, "pyth" | "ecb-ref" | null>;
    for (const k of Object.keys(FEEDS) as FeedKey[]) {
      const lp = live.prices[k];
      spots[k] = lp?.price ?? DEMO_SPOTS[k];
      publish[k] = lp?.publishTime ?? null;
      src[k] = lp?.source ?? null;
    }
    return { spots, publish, src };
  }

  function quoteFor(id: MarketId): MarketQuote {
    const m = marketConfig(id);
    const { spots, publish, src } = feedSpots();
    let spot = m.compose(spots);
    const pubs = m.feeds.map((f) => publish[f]);
    const srcs = m.feeds.map((f) => src[f]);
    let source: SpotSource;
    let publishTime: number;
    if (demo.demoMode) {
      spot *= demo.shocks[id] ?? 1;
      source = "demo-override";
      publishTime = nowSec();
    } else if (srcs.some((x) => x === null)) {
      // any leg without a feed (metals without a Pyth key) → the whole market is a demo placeholder
      source = "demo-static";
      publishTime = Math.min(...pubs.filter((p): p is number => p !== null), startSec);
    } else if (srcs.some((x) => x === "ecb-ref")) {
      source = "ecb-ref";
      publishTime = Math.min(...(pubs as number[]));
    } else {
      source = "pyth";
      publishTime = Math.min(...(pubs as number[]));
    }
    const status = opts.forceStatus?.[id] ?? marketStatus({ source, publishTime, nowSec: Math.floor(realNow() / 1000) });
    const forwards = Object.fromEntries(TENORS.map((t) => [t, forwardFor(id, spot, rates, t)])) as Record<Tenor, number>;
    const best = offers.filter((o) => o.market === id).reduce<number | null>((acc, o) => (acc === null || o.spreadBps < acc ? o.spreadBps : acc), null);
    return { id, group: m.group, base: m.base, quote: m.quote, spot, source, publishTime, status, forwards, carryPct: carryPct(id, rates), im: m.im, bestSpreadBps: best };
  }

  // ---------- Positions ----------
  /** Unshocked spot, so demo history never depends on when Dispatch was used. */
  const baseSpot = (id: MarketId) => marketConfig(id).compose(feedSpots().spots);

  function seedPositions(): InternalPosition[] {
    const t0 = nowSec();
    const usdtry = baseSpot("USD/TRY");
    const eurtry = baseSpot("EUR/TRY");
    const mk = (p: Partial<InternalPosition> & Pick<InternalPosition, "market" | "side" | "notionalUsd" | "strike" | "tenorDays" | "status">, ageDays: number, no: string): InternalPosition => {
      const m = marketConfig(p.market);
      const im = round2(p.notionalUsd * m.im);
      return {
        id: `pos-${no}`, no, mint: "USDC", quantity: 0, openedAt: t0 - ageDays * DAY, maturity: t0 + (p.tenorDays - ageDays) * DAY,
        imUsd: im, marginUsd: im, closedFraction: 0, breachCount: 0, demo: true, ...p,
      } as InternalPosition;
    };
    const withQty = (p: InternalPosition, spot: number) => ({ ...p, quantity: p.notionalUsd / (spot * usdPerQuote(p.market, spot)) });

    // Strikes are set so the marked PnL lands where the story needs it.
    const fwd = (id: MarketId, spot: number, days: number) => forwardFor(id, spot, rates, days);
    // 1 · OPEN: freelancer short USD/TRY, 60 of 90 days left, roughly flat.
    const openSpot = usdtry;
    const p1 = withQty(mk({ market: "USD/TRY", side: "short", notionalUsd: 1_500, tenorDays: 90, status: "Open", strike: fwd("USD/TRY", openSpot, 60) * 1.004 }, 30, "0001"), openSpot);
    // 2 · MARGIN CALL: exporter short EUR/TRY; euro rallied, equity ≈ 40% of IM.
    const p2base = mk({ market: "EUR/TRY", side: "short", notionalUsd: 2_000, tenorDays: 60, status: "Called", strike: 0 }, 20, "0002");
    const p2 = withQty(p2base, eurtry);
    // long PnL needed: user short loses 120 → long gains 120: Q(F−K)/S = 120 → K = F − 120·S/Q
    const f2 = fwd("EUR/TRY", eurtry, 40);
    p2.strike = f2 - (120 * eurtry) / p2.quantity;
    // 3 · PARTIAL 30%: importer long USD/CNH, 30% closed by the crank, rest still under water.
    const cnh = baseSpot("USD/CNH");
    const p3 = withQty(mk({ market: "USD/CNH", side: "long", notionalUsd: 1_400, tenorDays: 90, status: "PartiallyLiquidated", closedFraction: 0.3, strike: 0, mint: "USDG" }, 45, "0003"), cnh);
    p3.imUsd = round2(p3.notionalUsd * 0.03);
    p3.marginUsd = round2(p3.imUsd * 0.62);
    p3.strike = fwd("USD/CNH", cnh, 45) + (p3.imUsd * 0.25 * cnh) / p3.quantity;
    // 4 · VOID: freelancer short USD/TRY $3,000 caught by a 12% overnight gap.
    // Owed 412.50 = loser margin 300.00 → insurance 90.00 → winner haircut 22.50.
    const p4 = withQty(mk({ market: "USD/TRY", side: "short", notionalUsd: 3_000, tenorDays: 90, status: "Liquidated", strike: 0, mint: "USDG" }, 50, "0004"), usdtry);
    p4.strike = usdtry * 0.88;
    p4.marginUsd = 0;
    p4.finalPnlUsd = -300;
    p4.finalMark = usdtry * 0.88 * 1.1375;
    p4.waterfall = { owedUsd: 412.5, loserMarginUsd: 300, insuranceUsd: 90, winnerHaircutUsd: 22.5 };
    // 5 · SETTLED: freelancer short USD/TRY $500, 30 days, settled at the fixing.
    const p5 = withQty(mk({ market: "USD/TRY", side: "short", notionalUsd: 500, tenorDays: 30, status: "Settled", strike: 0 }, 32, "0005"), usdtry);
    p5.strike = usdtry * 1.0081;
    p5.finalMark = usdtry;
    p5.finalPnlUsd = round2(pnlUsd("USD/TRY", "short", p5.quantity, p5.strike, usdtry));
    p5.marginUsd = 0;
    return [p1, p2, p3, p4, p5];
  }

  const seedHistory = opts.seedDemoPositions ?? true;
  function ensurePositions(): InternalPosition[] {
    if (!positions) positions = seedHistory ? seedPositions().map((p) => ({ ...p, history: true })) : [];
    return positions;
  }
  /** Positions the user can see: their own, plus demo history while demo mode is on. */
  const visible = () => ensurePositions().filter((p) => !p.history || demo.demoMode);

  function markOf(p: InternalPosition): number {
    const q = quoteFor(p.market);
    const remaining = Math.max(0, (p.maturity - nowSec()) / DAY);
    return forwardFor(p.market, q.spot, rates, remaining);
  }

  function present(p: InternalPosition): Position {
    const terminal = p.status === "Settled" || p.status === "Liquidated";
    const mark = terminal ? (p.finalMark ?? p.strike) : markOf(p);
    const pnl = terminal ? (p.finalPnlUsd ?? 0) : round2(pnlUsd(p.market, p.side, p.quantity, p.strike, mark));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { breachCount, finalMark, finalPnlUsd, history, ...rest } = p;
    return { ...rest, pnlUsd: pnl, markPrice: mark };
  }

  const entry = (action: string, effect: string): DispatchEntry => {
    const e = { id: `log-${log.length + 1}`, at: realNow(), action, effect };
    log = [e, ...log].slice(0, 60);
    return e;
  };

  const done = (e: DispatchEntry) => { notify(); return e; };

  // ---------- Ladder ----------
  function quoteLadderSync(req: LadderRequest): LadderQuote {
    const q = quoteFor(req.market);
    const makerSide: Side = req.side === "short" ? "long" : "short";
    const t0 = nowSec();
    const rungs: RungQuote[] = req.rungs.map((r) => {
      const forward = forwardFor(req.market, q.spot, rates, r.tenorDays);
      const candidates = offers
        .filter((o) => o.market === req.market && o.makerSide === makerSide && r.tenorDays >= o.minTenorDays && r.tenorDays <= o.maxTenorDays && o.capacityUsd >= r.amount)
        .sort((a, b) => a.spreadBps - b.spreadBps);
      const best = candidates[0] ?? null;
      const spreadBps = best?.spreadBps ?? 0;
      const strike = strikeFor(forward, req.side, spreadBps);
      const notionalUsd = r.amount;
      const qty = notionalUsd / (q.spot * usdPerQuote(req.market, q.spot));
      return {
        ...r, forward, strike, notionalUsd, spreadBps, offerId: best?.id ?? null,
        marginUsd: ceil2(notionalUsd * q.im),
        feeUsd: ceil2((notionalUsd * PROTOCOL.openFeeBps) / 10_000),
        maturity: t0 + r.tenorDays * DAY,
        lockedQuote: qty * strike,
      };
    });
    const totalMarginUsd = round2(rungs.reduce((a, r) => a + r.marginUsd, 0));
    const totalFeeUsd = round2(rungs.reduce((a, r) => a + r.feeUsd, 0));
    return { market: req.market, side: req.side, mint: req.mint, rungs, totalMarginUsd, totalFeeUsd, requiredUsd: round2(totalMarginUsd + totalFeeUsd), openFeeBps: PROTOCOL.openFeeBps, imPct: q.im * 100 };
  }

  function preflightSync(quote: LadderQuote): Preflight {
    if (!wallet.connected) return { ok: false, reason: "no-wallet" };
    if ((wallet.solBalance ?? 0) <= 0) return { ok: false, reason: "need-sol" };
    const q = quoteFor(quote.market);
    if (isPaused(q.status)) return { ok: false, reason: "market-closed", status: q.status };
    if (quote.rungs.some((r) => !r.offerId)) return { ok: false, reason: "no-offer" };
    const bal = wallet.balances[quote.mint];
    if (bal < quote.requiredUsd) return { ok: false, reason: "need-tokens", requiredUsd: quote.requiredUsd, balanceUsd: bal };
    return { ok: true };
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  positions = null;
  ensurePositions();

  const provider: ParityData & { _debug: () => unknown } = {
    async getMarkets() {
      refreshLive();
      return MARKETS.map((m) => quoteFor(m.id));
    },
    async getRates() { return rates.map((r) => ({ ...r })); },
    async getOffers(market) { return offers.filter((o) => !market || o.market === market); },
    async getPositions() {
      refreshLive();
      return [...visible()].sort((a, b) => b.openedAt - a.openedAt).map(present);
    },
    async getWallet() { return { ...wallet, balances: { ...wallet.balances } }; },
    async getDemo() { return { ...demo, shocks: { ...demo.shocks } }; },
    async getDispatchLog() { return [...log]; },
    async getFeedHealth(): Promise<FeedHealth> {
      refreshLive();
      return { live: live.ok && live.provider === "pyth", checkedAt: live.checkedAt || null, note: live.note };
    },

    async connect() {
      await sleep(opts.offline ? 0 : 450);
      wallet = { ...wallet, connected: true, address: wallet.address ?? fakeBase58(44, rnd), label: "Demo wallet (mock)" };
      notify();
      return provider.getWallet();
    },
    async disconnect() {
      wallet = { ...wallet, connected: false };
      notify();
      return provider.getWallet();
    },
    async faucet(mint): Promise<FaucetResult> {
      if (!wallet.connected) throw new Error("Connect a wallet first.");
      await sleep(opts.offline ? 0 : 700);
      wallet.balances[mint] = round2(wallet.balances[mint] + FAUCET_AMOUNT);
      notify();
      return { mint, amount: FAUCET_AMOUNT, balance: wallet.balances[mint], signature: fakeBase58(64, rnd) };
    },

    async requestSol() {
      if (!wallet.connected) throw new Error("Connect a wallet first.");
      await sleep(opts.offline ? 0 : 600);
      wallet.solBalance = round2((wallet.solBalance ?? 0) + 1);
      notify();
      return { amount: 1, balance: wallet.solBalance, signature: fakeBase58(64, rnd) };
    },

    async quoteLadder(req) { return quoteLadderSync(req); },
    async preflight(quote) { return preflightSync(quote); },
    async lockLadder(req): Promise<LockResult> {
      const quote = quoteLadderSync(req);
      const pf = preflightSync(quote);
      if (!pf.ok) throw new Error(`Preflight failed: ${pf.reason}`);
      await sleep(opts.offline ? 0 : 1400);
      wallet.balances[req.mint] = round2(wallet.balances[req.mint] - quote.requiredUsd);
      const t0 = nowSec();
      const q = quoteFor(req.market);
      const created: InternalPosition[] = quote.rungs.map((r) => {
        counter += 1;
        const no = String(counter).padStart(4, "0");
        return {
          id: `pos-${no}`, no, market: req.market, side: req.side, notionalUsd: r.notionalUsd,
          quantity: r.notionalUsd / (q.spot * usdPerQuote(req.market, q.spot)), strike: r.strike,
          openedAt: t0 + counter, maturity: r.maturity, tenorDays: r.tenorDays, mint: req.mint, status: "Open",
          imUsd: r.marginUsd, marginUsd: r.marginUsd, closedFraction: 0, breachCount: 0, demo: true,
        };
      });
      for (const r of quote.rungs) {
        const o = offers.find((x) => x.id === r.offerId);
        if (o) o.capacityUsd -= r.notionalUsd;
      }
      positions = [...created, ...ensurePositions()];
      entry("LOCK LADDER", `${created.length} coupons on ${req.market} · margin $${quote.totalMarginUsd.toFixed(2)} + fee $${quote.totalFeeUsd.toFixed(2)} (mock tx)`);
      notify();
      return { signature: fakeBase58(88, rnd), positions: created.map(present) };
    },
    async lockedByMonth(market, side) {
      const out: Record<number, number> = {};
      const t = nowSec();
      for (const p of visible()) {
        if (p.market !== market || p.side !== side) continue;
        if (p.status === "Settled" || p.status === "Liquidated" || p.maturity <= t) continue;
        const month = Math.min(6, Math.max(1, Math.round((p.maturity - t) / (30 * DAY))));
        out[month] = round2((out[month] ?? 0) + p.notionalUsd);
      }
      return out;
    },
    async addMargin(positionId, amountUsd) {
      const p = ensurePositions().find((x) => x.id === positionId);
      if (!p) throw new Error("Unknown position");
      if (!wallet.connected) throw new Error("Connect a wallet first.");
      if (wallet.balances[p.mint] < amountUsd) throw new Error(`Not enough test ${p.mint}.`);
      await sleep(opts.offline ? 0 : 600);
      wallet.balances[p.mint] = round2(wallet.balances[p.mint] - amountUsd);
      p.marginUsd = round2(p.marginUsd + amountUsd);
      const eq = p.marginUsd + present(p).pnlUsd;
      if (p.status === "Called" && eq >= PROTOCOL.callEquity * p.imUsd) p.status = "Open";
      entry("ADD MARGIN", `No. ${p.no} +$${amountUsd.toFixed(2)} ${p.mint} → equity $${eq.toFixed(2)}`);
      notify();
      return present(p);
    },

    demo: {
      async setDemoMode(on) {
        demo = { ...demo, demoMode: on };
        return done(entry(on ? "DEMO MODE ON" : "DEMO MODE OFF", on ? "Demo prices supersede the feed; markets open; demo coupons No. 0001–0005 shown." : "Real prices only (Pyth with a key, else ECB reference); markets follow real hours; demo coupons hidden."));
      },
      async shock(market, pct) {
        if (!demo.demoMode) return done(entry(`SHOCK ${market} ${pct > 0 ? "+" : ""}${pct}%`, "Refused — demo mode is off."));
        const prev = quoteFor(market).spot;
        demo = { ...demo, shocks: { ...demo.shocks, [market]: (demo.shocks[market] ?? 1) * (1 + pct / 100) } };
        const next = quoteFor(market).spot;
        return done(entry(`SHOCK ${market} ${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`, `Spot ${prev.toFixed(4)} → ${next.toFixed(4)}`));
      },
      async advanceClock(days) {
        if (!demo.demoMode) return done(entry(`CLOCK +${days}D`, "Refused — demo mode is off."));
        demo = { ...demo, clockOffsetDays: demo.clockOffsetDays + days };
        return done(entry(`CLOCK +${days}D`, `Protocol clock now +${demo.clockOffsetDays} days.`));
      },
      async setRate(code: RateCode, ratePct: number) {
        const before = rates.find((r) => r.code === code)?.ratePct;
        rates = rates.map((r) => (r.code === code ? { ...r, ratePct, updatedAt: nowSec() } : r));
        return done(entry(`SET RATE ${code}`, `${before?.toFixed(2)}% → ${ratePct.toFixed(2)}% (forwards repriced)`));
      },
      async markNow() {
        let called = 0, breached = 0, healthy = 0;
        for (const p of visible()) {
          if (p.status === "Settled" || p.status === "Liquidated") continue;
          const eq = p.marginUsd + present(p).pnlUsd;
          if (eq < PROTOCOL.liqEquity * p.imUsd) { p.breachCount += 1; breached += 1; if (p.status === "Open") p.status = "Called"; }
          else if (eq < PROTOCOL.callEquity * p.imUsd) { p.breachCount = 0; called += 1; if (p.status === "Open") p.status = "Called"; }
          else { p.breachCount = 0; healthy += 1; if (p.status === "Called") p.status = "Open"; }
        }
        const maxBreach = Math.max(0, ...visible().map((p) => p.breachCount));
        return done(entry("MARK NOW", `${healthy} healthy · ${called} on call · ${breached} below 20%${breached ? ` (fresh mark ${Math.min(maxBreach, LIQ_CONFIRM_MARKS)}/${LIQ_CONFIRM_MARKS})` : ""}`));
      },
      async liquidate() {
        let partial = 0, full = 0, waiting = 0;
        for (const p of visible()) {
          if (p.status === "Settled" || p.status === "Liquidated") continue;
          const pres = present(p);
          const eq = p.marginUsd + pres.pnlUsd;
          if (eq >= PROTOCOL.liqEquity * p.imUsd) continue;
          if (p.breachCount < LIQ_CONFIRM_MARKS) { waiting += 1; continue; }
          p.breachCount = 0;
          // close 30%: realise 30% of PnL, scale size and IM to 70%
          const realised = pres.pnlUsd * PROTOCOL.partialLiq;
          const penalty = (p.notionalUsd * PROTOCOL.partialLiq * PROTOCOL.liqPenaltyBps) / 10_000;
          p.marginUsd = round2(p.marginUsd + realised - penalty);
          p.quantity *= 1 - PROTOCOL.partialLiq;
          p.notionalUsd = round2(p.notionalUsd * (1 - PROTOCOL.partialLiq));
          p.imUsd = round2(p.imUsd * (1 - PROTOCOL.partialLiq));
          p.closedFraction = round2(1 - (1 - p.closedFraction) * (1 - PROTOCOL.partialLiq));
          const eq2 = p.marginUsd + present(p).pnlUsd;
          if (eq2 < PROTOCOL.liqEquity * p.imUsd) {
            const owed = round2(Math.max(0, -present(p).pnlUsd));
            const fromMargin = round2(Math.min(Math.max(p.marginUsd, 0), owed));
            const fromInsurance = round2(Math.min(owed - fromMargin, 250));
            const haircut = round2(owed - fromMargin - fromInsurance);
            p.waterfall = { owedUsd: owed, loserMarginUsd: fromMargin, insuranceUsd: fromInsurance, winnerHaircutUsd: haircut };
            p.finalPnlUsd = -fromMargin;
            p.finalMark = markOf(p);
            p.marginUsd = 0;
            p.status = "Liquidated";
            full += 1;
          } else {
            p.status = "PartiallyLiquidated";
            partial += 1;
          }
        }
        const parts = [
          partial ? `${partial} partial (30%)` : "",
          full ? `${full} closed in full → waterfall` : "",
          waiting ? `${waiting} below 20% awaiting ${LIQ_CONFIRM_MARKS} fresh marks` : "",
        ].filter(Boolean);
        return done(entry("LIQUIDATE", parts.length ? parts.join(" · ") : "Nothing below the 20% line."));
      },
      async settle() {
        let n = 0;
        const t = nowSec();
        for (const p of visible()) {
          if (p.status === "Settled" || p.status === "Liquidated" || p.maturity > t) continue;
          const spot = quoteFor(p.market).spot;
          p.finalMark = spot;
          p.finalPnlUsd = round2(pnlUsd(p.market, p.side, p.quantity, p.strike, spot));
          wallet.balances[p.mint] = round2(wallet.balances[p.mint] + Math.max(0, p.marginUsd + p.finalPnlUsd));
          p.marginUsd = 0;
          p.status = "Settled";
          n += 1;
        }
        return done(entry("SETTLE", n === 0 ? "No coupon has reached its settlement date." : `${n} coupon${n > 1 ? "s" : ""} settled at spot; payouts to owners' token accounts.`));
      },
      async reset() {
        demo = { demoMode: false, clockOffsetDays: 0, shocks: {} };
        rates = SEED_RATES.map((r) => ({ ...r, updatedAt: nowSec() }));
        positions = null;
        return done(entry("RESET", "Back to the load state: demo mode off, clock, rates and demo coupons restored."));
      },
    },

    peek: {
      markets: () => MARKETS.map((m) => quoteFor(m.id)),
      rates: () => rates.map((r) => ({ ...r })),
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    async info() { return { kind: "preview" as const, cluster: null, admin: null, isAdmin: true }; },

    _debug: () => ({ demo, wallet, live, positions }),
  };

  return provider;
}
