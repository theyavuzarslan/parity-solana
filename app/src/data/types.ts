/**
 * Parity data contracts. Everything the UI reads or does goes through
 * `ParityData`; the mock provider implements it tonight, the Anchor/devnet
 * provider replaces it later without touching components.
 * All values are plain serialisable objects (no classes, no BN, no PublicKey).
 */

export type MarketId =
  | "USD/TRY" | "EUR/TRY" | "GBP/TRY" | "GAU/TRY"
  | "EUR/USD" | "GBP/USD" | "USD/CHF" | "USD/JPY"
  | "USD/CNH" | "USD/MXN" | "USD/BRL" | "USD/ZAR" | "USD/INR"
  | "XAU/USD" | "XAG/USD";

export type MarketGroup = "Lira" | "Gold" | "Majors" | "Trade partners" | "EM peers" | "Metals";

export type RateCode =
  | "USD" | "TRY" | "EUR" | "GBP" | "CHF" | "JPY" | "CNH"
  | "MXN" | "BRL" | "ZAR" | "INR" | "XAU" | "XAG";

/**
 * OPEN: fresh price (or demo override). CLOSED: last publish older than 120 s (weekend/holiday).
 * STALE: no feed for this market, a static demo spot is shown.
 * REF: priced off a daily reference rate (ECB via Frankfurter) — not a live feed. (added in pass 2)
 */
export type MarketStatus = "OPEN" | "CLOSED" | "STALE" | "REF";

/**
 * Where a spot came from. "ecb-ref" = ECB daily reference rate (added in pass 2).
 * "demo-override" = preview (mock) demo mode set from Dispatch. "relay" = chain demo mode: the
 * admin relay's reference price written on-chain (ECB daily, or Pyth via Hermes), or a Dispatch shock of it.
 */
export type SpotSource = "pyth" | "demo-override" | "demo-static" | "ecb-ref" | "relay";

export type Tenor = 30 | 90 | 180;

export interface MarketQuote {
  id: MarketId;
  group: MarketGroup;
  base: RateCode | "GAU";
  quote: RateCode;
  spot: number;
  source: SpotSource;
  /** unix seconds of the newest price input used */
  publishTime: number;
  status: MarketStatus;
  forwards: Record<Tenor, number>;
  /** annual rate gap r_quote − r_base, in percent */
  carryPct: number;
  /** initial margin, fraction of notional */
  im: number;
  /** tightest demo maker spread on this market, bps (null = no offer) */
  bestSpreadBps: number | null;
  /**
   * USD per one unit of the quote currency at this spot (program: quote_conv). 1 for USD quotes;
   * 1 / USD/TRY for USD/TRY, EUR/TRY, GBP/TRY and GAU/TRY alike. Quantity = notional / (spot × upq).
   */
  upq: number;
}

export interface Rate {
  code: RateCode;
  /** annual, percent (e.g. 40 = 40%) */
  ratePct: number;
  basis: 360 | 365;
  updatedAt: number;
  source: string;
}

export type Mint = "USDC" | "USDG";
export type Side = "long" | "short";

export interface Offer {
  id: string;
  market: MarketId;
  maker: string;
  /** side the maker takes; a taker gets the opposite */
  makerSide: Side;
  spreadBps: number;
  minTenorDays: number;
  maxTenorDays: number;
  capacityUsd: number;
  mint: Mint;
  demo: true;
}

/** On-chain status names (spec §5). Presentation maps these to stamps. */
export type PositionStatus = "Open" | "Called" | "PartiallyLiquidated" | "Liquidated" | "Settled";

export interface Waterfall {
  /** what the loser owed the winner at close, USD */
  owedUsd: number;
  loserMarginUsd: number;
  insuranceUsd: number;
  winnerHaircutUsd: number;
}

export interface Position {
  id: string;
  /** display number on the coupon stub, e.g. "0007" */
  no: string;
  market: MarketId;
  /** the user's side */
  side: Side;
  notionalUsd: number;
  /** base-currency quantity */
  quantity: number;
  strike: number;
  openedAt: number;
  maturity: number;
  tenorDays: number;
  mint: Mint;
  status: PositionStatus;
  imUsd: number;
  marginUsd: number;
  /** marked PnL for the user's side, USD (signed) */
  pnlUsd: number;
  /** fraction already closed by partial liquidation (0.3 = 30%) */
  closedFraction: number;
  markPrice: number;
  waterfall?: Waterfall;
  demo: boolean;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  label: string | null;
  balances: Record<Mint, number>;
  /** test SOL for fees (added in pass 2; undefined = provider does not track it) */
  solBalance?: number;
}

export interface LadderRung {
  month: number;
  tenorDays: number;
  /** USD notional of the rung (the Advisor sizes every ladder in USD) */
  amount: number;
}

export interface LadderRequest {
  market: MarketId;
  /** user side on the forward: USD earner sells USD → short */
  side: Side;
  mint: Mint;
  rungs: LadderRung[];
}

export interface RungQuote extends LadderRung {
  forward: number;
  strike: number;
  notionalUsd: number;
  marginUsd: number;
  feeUsd: number;
  spreadBps: number;
  offerId: string | null;
  maturity: number;
  /** locked quote-currency amount, e.g. TRY */
  lockedQuote: number;
}

export interface LadderQuote {
  market: MarketId;
  side: Side;
  mint: Mint;
  rungs: RungQuote[];
  totalMarginUsd: number;
  totalFeeUsd: number;
  /** margin + fee — what the wallet must hold */
  requiredUsd: number;
  openFeeBps: number;
  imPct: number;
}

export type Preflight =
  | { ok: true }
  | { ok: false; reason: "no-wallet" }
  /** added in pass 2: the wallet holds no test SOL for fees */
  | { ok: false; reason: "need-sol" }
  | { ok: false; reason: "need-tokens"; requiredUsd: number; balanceUsd: number }
  /** detail (chain provider): e.g. the program has no on-chain price for this market */
  | { ok: false; reason: "market-closed"; status: MarketStatus; detail?: string }
  /** detail (chain provider): why the maker cannot take it — tenor, capacity or maker margin */
  | { ok: false; reason: "no-offer"; detail?: string };

export interface LockResult {
  signature: string;
  positions: Position[];
}

export interface FaucetResult {
  mint: Mint;
  amount: number;
  balance: number;
  signature: string;
}

export interface DemoState {
  demoMode: boolean;
  /** extra days added to the protocol clock */
  clockOffsetDays: number;
  /** per-market override multipliers applied to spot (1 = none) */
  shocks: Partial<Record<MarketId, number>>;
}

export interface DispatchEntry {
  id: string;
  at: number;
  action: string;
  effect: string;
}

export interface FeedHealth {
  /** true when Hermes answered with prices in the last poll */
  live: boolean;
  checkedAt: number | null;
  note: string;
  /** chain: blockTime (unix s) of the newest write to the demo price account (relay or Dispatch) */
  relayedAt?: number | null;
  /** chain: what the admin relay forwards (NEXT_PUBLIC_RELAY_SOURCE) */
  relaySource?: "ecb" | "hermes";
}

/** Which implementation is answering (added with the chain provider). */
export interface ProviderInfo {
  /** chain: the deployed program; preview: the in-memory mock ("Preview data") */
  kind: "chain" | "preview";
  cluster: "devnet" | "localnet" | null;
  /** config.admin (chain only) */
  admin: string | null;
  /** connected wallet == config.admin (mock: always true, Dispatch is open) */
  isAdmin: boolean;
  /** insurance fund balances per collateral mint, test USD (chain only) */
  insurance?: Record<Mint, number>;
}

export interface ParityData {
  // Reads
  getMarkets(): Promise<MarketQuote[]>;
  getRates(): Promise<Rate[]>;
  getOffers(market?: MarketId): Promise<Offer[]>;
  getPositions(): Promise<Position[]>;
  getWallet(): Promise<WalletState>;
  getDemo(): Promise<DemoState>;
  getDispatchLog(): Promise<DispatchEntry[]>;
  getFeedHealth(): Promise<FeedHealth>;

  // Wallet
  connect(): Promise<WalletState>;
  disconnect(): Promise<WalletState>;
  faucet(mint: Mint): Promise<FaucetResult>;
  /** Added in pass 2: devnet SOL airdrop for fees (mock: 1 test SOL). */
  requestSol(): Promise<{ amount: number; balance: number; signature: string }>;

  // Trading
  quoteLadder(req: LadderRequest): Promise<LadderQuote>;
  preflight(quote: LadderQuote): Promise<Preflight>;
  /**
   * `expected` (optional): the quote the user was shown. The provider re-plans right before building
   * and signing and throws QuoteChangedError (data/quoteDrift) with the fresh quote on any drift.
   */
  lockLadder(req: LadderRequest, expected?: LadderQuote): Promise<LockResult>;
  addMargin(positionId: string, amountUsd: number): Promise<Position>;
  /**
   * Added in pass 2. USD notional already locked on this market and side, bucketed
   * by settlement month (1 = settles within ~30 days … 6), live positions only.
   * The Advisor nets these out so a check-in never double-locks a month.
   */
  lockedByMonth(market: MarketId, side: Side): Promise<Record<number, number>>;

  // Dispatch (admin / demo; devnet only)
  demo: {
    setDemoMode(on: boolean): Promise<DispatchEntry>;
    shock(market: MarketId, pct: number): Promise<DispatchEntry>;
    advanceClock(days: number): Promise<DispatchEntry>;
    setRate(code: RateCode, ratePct: number): Promise<DispatchEntry>;
    markNow(): Promise<DispatchEntry>;
    liquidate(): Promise<DispatchEntry>;
    settle(): Promise<DispatchEntry>;
    reset(): Promise<DispatchEntry>;
  };

  /** Added with the chain provider (optional): which implementation answers, and admin access. */
  info?(): Promise<ProviderInfo>;

  /** Notifies after any state change so views can refetch. Returns unsubscribe. */
  subscribe(listener: () => void): () => void;

  /**
   * Added in pass 2 (optional): synchronous snapshots of cached reads, so the
   * first paint (including the server render) shows seeded prices instead of
   * waiting on the network. Providers without a cache omit it.
   */
  peek?: {
    markets(): MarketQuote[];
    rates(): Rate[];
  };
}
