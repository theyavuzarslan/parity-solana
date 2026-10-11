# Parity on Solana — Design Spec

Date: 2026-10-12
Team: Atakan Yavuzarslan, Nur Kardelen
Targets: Colosseum Crypto World's Fair (Solana track) + Superteam Türkiye local track
Deadline: 2026-10-12 11:59pm PT (2026-10-13 09:59 Istanbul) — registration and submission

## 1. Intent

Rebuild Parity — our Stellar hackathon prototype (github.com/nurkardelens/parity-stellar) — from scratch on Solana, sharpened around one real problem: **Turkish lira volatility**. Turks earn, owe, and save across currencies with no simple instrument to lock a future rate. Parity is a two-sided, margined, cash-settled FX & metals forward market where the forward price is computed on-chain from interest-rate parity, not quoted by a dealer.

**Status framing (everywhere: README, app, pitch):** a *proposed* design, deployed on **Solana devnet with test tokens only**, no real funds, not offered to anyone (including Turkish residents) pending legal advice. The Hedge Advisor is labelled a "hedge calculator", not financial advice.

**Prior work disclosure (Rules §9):** "Evolves our earlier Stellar hackathon prototype (same team, our IP). The Solana program and app are rebuilt from scratch."

### Users (all three served; pitch leads with #1)
1. **Freelancers / remote workers paid in USD/USDC** — lock next months' TRY for rent/bills. Hero persona.
2. **Exporters / importers (SMEs)** — EUR/TRY, USD/TRY, USD/CNH ladders for receivables/payables.
3. **Savers** — gram gold (XAU/TRY per gram) forward. Presented as *proposed future product* (most legally sensitive).

### Success criteria
- Working devnet program + Vercel-hosted app demonstrating: advisor → one-click ladder hedge → mark-to-market → margin call → partial liquidation → bad-debt waterfall → settlement, in both USDC and USDG.
- 15 markets live-priced from Pyth.
- Public GitHub repo, English README, ≤3-min pitch video script, ≤3-min demo video storyboard.
- Submitted to Colosseum (Solana track) and Superteam Türkiye listing. No other sidetracks.

## 2. Markets (15)

| # | Market | Price composition (Pyth feeds) | Quote→USD | Initial margin |
|---|---|---|---|---|
| 1 | USD/TRY | FX.USD/TRY | ÷ USD/TRY | 10% |
| 2 | EUR/TRY | FX.EUR/USD × FX.USD/TRY | ÷ USD/TRY | 10% |
| 3 | GBP/TRY | FX.GBP/USD × FX.USD/TRY | ÷ USD/TRY | 10% |
| 4 | GAU/TRY (gram gold in TRY) | Metal.XAU/USD × FX.USD/TRY ÷ 31.1034768 | ÷ USD/TRY | 10% |
| 5 | EUR/USD | FX.EUR/USD | 1 | 3% |
| 6 | GBP/USD | FX.GBP/USD | 1 | 3% |
| 7 | USD/CHF | FX.USD/CHF | ÷ USD/CHF | 3% |
| 8 | USD/JPY | FX.USD/JPY | ÷ USD/JPY | 3% |
| 9 | USD/CNH | FX.USD/CNH | ÷ USD/CNH | 3% |
| 10 | USD/MXN | FX.USD/MXN | ÷ USD/MXN | 6% |
| 11 | USD/BRL | FX.USD/BRL | ÷ USD/BRL | 6% |
| 12 | USD/ZAR | FX.USD/ZAR | ÷ USD/ZAR | 6% |
| 13 | USD/INR | FX.USD/INR | ÷ USD/INR | 6% |
| 14 | XAU/USD | Metal.XAU/USD | 1 | 6% |
| 15 | XAG/USD | Metal.XAG/USD | 1 | 6% |

12 distinct Pyth feeds. Full feed IDs are pinned in code from Hermes (`/v2/price_feeds`). All 15 markets are config-driven and live; the demo focuses on USD/TRY, EUR/TRY, GAU/TRY, EUR/USD, XAU/USD. Minimum initial margin is 10% (≤10x) on every market, matching Turkey's retail FX leverage cap; the words "leverage", "kaldıraç" and "forex" are not used in product copy.

## 3. Rates registry (13 codes)

USD, TRY, EUR, GBP, CHF, JPY, CNH, MXN, BRL, ZAR, INR, XAU, XAG. Each: annual rate (bps), day-count basis, `updated_at`, source label. Admin-set (governance stand-in). Seed values are taken from central-bank policy rates (and gold/silver lease-rate proxies) on build day and recorded with source URLs in `docs/rates.md`.

Day-count basis: 360 for USD, EUR, CHF, JPY, CNH, MXN, XAU, XAG; 365 for TRY, GBP, ZAR, INR, BRL (BRL's 252-business-day convention simplified to 365, documented).

## 4. Pricing math

All prices normalised to 1e8 fixed point (Pyth exponent normalised). i128 intermediates, multiply-before-divide, rounding against the user / in favour of the protocol.

- Spot S from composition table (product/quotient of feeds, × scale).
- Forward: `F = S × (1 + r_q·t/B_q) / (1 + r_b·t/B_b)` (metals: r_b is lease rate). Implemented as one integer expression `F = S × (B_q·1e4 + r_q·t) × B_b / (B_q × (B_b·1e4 + r_b·t))` with r in bps, t in seconds and B in seconds-per-year; t clamped ≥ 0 for late settlement.
- Strike at open: taker long → `K = F × (1 + spread)`; taker short → `K = F × (1 − spread)`. The maker earns the spread; value at inception is zero only when spread = 0.
- Quantity from USD notional N: `Q = N / (S × usd_per_quote)`. Minimum notional $10.
- Mark value for long (quote ccy): `Q × (F_t − K) / (1 + r_q·τ/B_q)` (discounted to today, τ = remaining time); in USD: `× usd_per_quote` at current spot. Short value is defined as exactly `−long`; any rounding dust goes to the insurance fund.
- At maturity F_t = S_T and the discount factor is 1 (NDF convention: `Q(S_T − K) × usd_per_quote(S_T)`).

## 5. On-chain program (Anchor, single program `parity`)

### Accounts (PDAs)
- `Config` [`config`]: admin, demo_mode, allowed collateral mints (USDC: SPL Token; USDG: Token-2022 with only MetadataPointer/TokenMetadata extensions — no TransferFee/TransferHook/DefaultAccountState), open_fee_bps=10 (taker), maker_fee_share_bps=1000 (protocol share of spread), liq_penalty_bps=100 (of closed notional), liquidator_reward_bps=2000 (share of penalty), partial_liq_bps=3000, call_equity_bps=5000, liq_equity_bps=2000, liq_confirm_marks=3, liq_confirm_min_gap_secs=30, max_price_age_secs=60, max_conf_bps.
- `Rate` [`rate`, code]: see §3.
- `Market` [`market`, id]: symbol, base, quote, feed_a, feed_b + op, scale, usd_per_quote leg, im_bps, active.
- `Vault` [`vault`, mint] and `Insurance` [`insurance`, mint]: program-owned token accounts per collateral mint (token_interface; supports SPL Token and Token-2022).
- `MakerOffer` [`offer`, maker, nonce]: market, mint, maker_side (Long/Short), spread_bps, min/max tenor days (1–365), capacity_usd remaining, margin_locked, position_counter, active.
- `Position` [`position`, offer, offer.position_counter] (nonce from the offer's counter, never caller input): long, short, market, mint, Q, K, opened_at, maturity, im per side, margin_long, margin_short, status {Open, Called, PartiallyLiquidated, Settled, Liquidated}, breach_count, last_publish_time.
- `DemoState` [`demo`]: per-market price override (price + its own publish_time = demo clock) + clock offset. When `demo_mode && override exists` for a market, the override fully supersedes Pyth for that market (so a shifted clock never makes prices stale). Ignored when `demo_mode=false`.

### Instructions
- Admin (all check `config.admin`; demo ixs also require `demo_mode`): `initialize`, `set_rate`, `upsert_market`, `set_demo_mode`, `set_demo_price`, `set_demo_clock`, `fund_insurance`.
- Maker: `create_offer` (locks capacity × IM), `cancel_offer` (returns unencumbered margin). Offers are seeded by script for the demo (no maker console UI).
- Taker: `take_offer(notional, tenor_days)` — validates tenor/capacity, computes F and K, transfers taker IM + open fee (rounded up; to insurance), moves maker IM from offer to position. A ladder = multiple `take_offer` ixs in one transaction (atomic).
- Either party: `add_margin`.
- Permissionless: `mark` (reads price; requires `publish_time` strictly greater than `position.last_publish_time`; updates equity/status; increments `breach_count` when equity < liq threshold and ≥ `liq_confirm_min_gap_secs` since the last counted breach, resets otherwise), `liquidate` (requires breach_count ≥ 3; closes 30% of Q realising PnL, scales Q and IM to 70%, penalty 1% of closed notional with 20% of it to the caller and the rest to insurance; if equity after the partial close is still < 20% of the reduced IM, closes fully), `settle` (after maturity; waterfall).
- Payouts: every transfer out of the vault (liquidate, settle, cancel) goes only to the associated token account of `position.long` / `position.short` / `offer.maker` for the position's mint (Anchor `associated_token::authority` constraint), so a permissionless caller cannot redirect funds. Settlement pays out directly; there is no separate claim step.

### Risk rules
- Equity_side = margin_side + PnL_side.
- Called: equity < 50% IM. Liquidatable: equity < 20% IM on 3 consecutive fresh marks.
- Loss waterfall (liquidation and settlement): loser margin → insurance fund (same mint) → pro-rata haircut on winner payout. Every step emits an event.
- Oracle: each passed price account must have `feed_id` equal to `market.feed_a` / `feed_b` and verification level Full (else `WrongFeed`); reject if `publish_time` older than `max_price_age_secs` or `conf/price > max_conf_bps` → `MarketClosedOrStale` / `OracleConfidence`. Weekend FX closure therefore halts marks (no stale liquidations).
- Gap risk is explicit: with 10% IM and a 20% liquidation threshold the buffer is 2% of notional, so a 2018-style overnight gap goes straight to the waterfall. This is shown, not hidden.

### Oracle integration
Pyth pull oracle via `pyth-solana-receiver-sdk` (`PriceUpdateV2`). User transactions never post price updates (a posted update is ~700 B; the tx limit is 1232 B, so a ladder could not fit). Instead the program reads stable price-feed PDAs (`getPriceFeedAccountAddress(shard, feedId)`). First task: inspect shard-0 PDAs on devnet for the 12 feeds; for any not sponsored, run Pyth's open-source `price-pusher` on our own shard (1000) to keep them fresh. Demo mode override is the fallback for the scripted video.

## 6. Hedge Advisor (client-side)

Inputs: persona, exposure (currency, amount/month, horizon months 1–6), risk preference {Conservative γ high, Balanced, Opportunistic γ low}.

- Volatility: EWMA (λ=0.94) on daily returns, precomputed from Pyth Benchmarks history into `vol.json` at build time (no live history calls in the app).
- Direct hedges only for this build: `h_MV = 1`. (Cross-hedge minimum-variance ratios are roadmap.)
- Cost-aware ratio (mean-variance, Anderson–Danthine), signed by hedger direction: hedger who **sells** the base forward (USD earner: freelancer, exporter) `h* = 1 + (F − E[S_T]) / (γ·σ²·X)`; hedger who **buys** the base forward (importer, saver) `h* = 1 − (F − E[S_T]) / (γ·σ²·X)`; clamped to [0, 1]. E[S_T] default = spot × (1 + EWMA drift × t); shown transparently with the inputs.
- Layered ladder: month1 ≤100%, month2 ≤75%, month3 ≤50%, … each scaled by h*. "Lock it" builds one transaction with one `take_offer` per rung against best offers.
- Output visual: TRY outcome distribution hedged vs unhedged across scenarios (−20%…+40% USD/TRY), cost of carry, forward vs spot.
- Disclaimer: "hedge calculator, not financial advice".

## 7. Frontend

Next.js (App Router) + TypeScript + `@coral-xyz/anchor` client + `@solana/wallet-adapter` (Phantom, Solflare, Backpack). Visual design produced with the **Impeccable** skill (time-boxed) before implementation, using a short brand file. Loading/pending states use `thinking-orbs` (MIT); the landing hero may use `p5.brush` (MIT) for a hand-painted USD/TRY line. Responsive down to phone width (Seeker-friendly).

Pages: Onboarding/persona + devnet faucet (test USDC/USDG) · Hedge Advisor · Markets (15, spot, 30/90/180d forward, carry, best offer) · Positions (margin bar, status, add margin, waterfall view) · Admin/demo control (devnet only). Persistent devnet/"proposed project" banner; every page reads and shows `demo_mode`. Copy says "lock a rate", never "pay rent with USDC".

Errors shown before signing (insufficient margin/capacity, market closed); ladder tx is atomic.

## 8. Testing

- Unit + property tests on math (zero value at inception, long+short=0 at all prices, cross & gram composition, overflow at extremes, day-count).
- LiteSVM integration tests: full lifecycle (open → call → partial liq → waterfall → settle) for USDC (SPL Token); open + settle for USDG (Token-2022); offer cancel/capacity; wrong-feed, stale, out-of-order publish_time and confidence rejection; payout-redirect rejection; ladder atomicity.
- Devnet end-to-end smoke run before recording.

## 9. Deployment

Program on Solana devnet (program ID in README), IDL published on-chain, verifiable build if time allows. Mock USDC (SPL Token) and mock USDG (Token-2022) mints with faucet. Frontend on Vercel. **Keeper script (Node) that marks and liquidates open positions every few seconds — required** (the demo depends on it). Price-pusher for unsponsored feeds. Demo is recorded while FX markets are open (after Sunday 22:00 UTC).

## 10. Submission package

- Public GitHub repo, README (problem, how it works, architecture, devnet addresses, devnet activity metrics, legal framing, prior-work disclosure).
- Business model: taker open fee (10 bps) + protocol share of maker spread (10%) + liquidation penalties feed the insurance fund first, then revenue.
- Market & competition: TAM framed on Turkish USD-earning freelancers/exporters and remittances (sources cited); competition = BIST VIOP USD/TRY futures (answer: on-chain gives access without a Turkish brokerage, small sizes, 24/7 settlement, stablecoin-native, cross-border users) and on-chain FX perps (Ostium, Synthetix) which are perpetuals priced by funding, not dated forwards priced by rate parity.
- Pitch video script (≤3 min) and demo video storyboard (≤3 min), English.
- Demo storyboard: freelancer advisor → one-click 3-month ladder → maker view → admin shocks USD/TRY (2018/2021-style) → call → partial liq → gap → waterfall → settle in USDG → tour 15 markets incl. gram gold.
- Superteam TR: Turkey as base country on Colosseum profile, intake form, Telegram group, submission on Earn listing. Both members registered on Colosseum before deadline.

## 11. Out of scope

Mainnet, real TRY delivery/physical settlement, LP vault as universal counterparty, on-chain advisor, other sidetracks, KYC, governance token, maker console UI, `update_offer`, cross-hedge ratios, live volatility history in-app, Turkish-language marketing.
