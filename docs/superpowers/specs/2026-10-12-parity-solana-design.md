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
| 1 | USD/TRY | FX.USD/TRY | ÷ USD/TRY | 8% |
| 2 | EUR/TRY | FX.EUR/USD × FX.USD/TRY | ÷ USD/TRY | 8% |
| 3 | GBP/TRY | FX.GBP/USD × FX.USD/TRY | ÷ USD/TRY | 8% |
| 4 | GAU/TRY (gram gold in TRY) | Metal.XAU/USD × FX.USD/TRY ÷ 31.1034768 | ÷ USD/TRY | 8% |
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

12 distinct Pyth feeds. Full feed IDs are pinned in code from Hermes (`/v2/price_feeds`).

## 3. Rates registry (13 codes)

USD, TRY, EUR, GBP, CHF, JPY, CNH, MXN, BRL, ZAR, INR, XAU, XAG. Each: annual rate (bps), day-count basis, `updated_at`, source label. Admin-set (governance stand-in). Seed values are taken from central-bank policy rates (and gold/silver lease-rate proxies) on build day and recorded with source URLs in `docs/rates.md`.

Day-count basis: 360 for USD, EUR, CHF, JPY, CNH, MXN, XAU, XAG; 365 for TRY, GBP, ZAR, INR, BRL (BRL's 252-business-day convention simplified to 365, documented).

## 4. Pricing math

All prices normalised to 1e8 fixed point (Pyth exponent normalised). i128 intermediates, multiply-before-divide, rounding against the user / in favour of the protocol.

- Spot S from composition table (product/quotient of feeds, × scale).
- Forward: `F = S × (1 + r_q·t/B_q) / (1 + r_b·t/B_b)` (t = days to maturity; metals: r_b is lease rate).
- Strike at open: `K = F ± spread` (side-dependent; maker earns spread).
- Quantity from USD notional N: `Q = N / (S × usd_per_quote)`.
- Mark value for long (quote ccy): `Q × (F_t − K)`; in USD: `× usd_per_quote`. Short = −long. Forward value is not discounted (documented simplification).
- At maturity F_t = S_T.

## 5. On-chain program (Anchor, single program `parity`)

### Accounts (PDAs)
- `Config` [`config`]: admin, demo_mode, allowed collateral mints (USDC: SPL Token; USDG: Token-2022), open_fee_bps=2, liq_penalty_bps=100, partial_liq_bps=3000, call_equity_bps=5000, liq_equity_bps=2000, liq_confirm_marks=3, max_price_age_secs, max_conf_bps.
- `Rate` [`rate`, code]: see §3.
- `Market` [`market`, id]: symbol, base, quote, feed_a, feed_b + op, scale, usd_per_quote leg, im_bps, active.
- `Vault` [`vault`, mint] and `Insurance` [`insurance`, mint]: program-owned token accounts per collateral mint (token_interface; supports SPL Token and Token-2022).
- `MakerOffer` [`offer`, maker, nonce]: market, mint, maker_side (Long/Short), spread_bps, min/max tenor days (1–365), capacity_usd remaining, margin_locked, active.
- `Position` [`position`, offer, nonce]: long, short, market, mint, Q, K, opened_at, maturity, im per side, margin_long, margin_short, status {Open, Called, PartiallyLiquidated, Settled, Liquidated}, breach_count, last_publish_time.
- `DemoState` [`demo`]: per-market price override + clock offset. Read only when `demo_mode=true`.

### Instructions
- Admin: `initialize`, `set_rate`, `upsert_market`, `set_demo_mode`, `set_demo_price`, `set_demo_clock`.
- Maker: `create_offer` (locks capacity × IM), `update_offer`, `cancel_offer` (returns unencumbered margin).
- Taker: `take_offer(notional, tenor_days)` — validates tenor/capacity, computes F and K, transfers taker IM + 2bps fee (to insurance), moves maker IM from offer to position. A ladder = multiple `take_offer` ixs in one transaction (atomic).
- Either party: `add_margin`.
- Permissionless: `mark` (reads price; updates equity/status; increments `breach_count` on a fresh publish time when equity < liq threshold, resets otherwise), `liquidate` (requires breach_count ≥ 3; first time closes 30% of Q, realising PnL; penalty to insurance; subsequent → full close), `settle` (after maturity; waterfall).

### Risk rules
- Equity_side = margin_side + PnL_side.
- Called: equity < 50% IM. Liquidatable: equity < 20% IM on 3 consecutive fresh marks.
- Loss waterfall (liquidation and settlement): loser margin → insurance fund (same mint) → pro-rata haircut on winner payout. Every step emits an event.
- Oracle: reject if `publish_time` older than `max_price_age_secs` or `conf/price > max_conf_bps` → `MarketClosedOrStale` / `OracleConfidence`. Weekend FX closure therefore halts marks (no stale liquidations).

### Oracle integration
Pyth pull oracle via `pyth-solana-receiver-sdk` (`PriceUpdateV2`). First implementation task verifies whether devnet sponsored feed accounts exist for all 12 feeds; otherwise the client posts Hermes updates in the same transaction (standard pull pattern). Demo mode override is the fallback for scripted video.

## 6. Hedge Advisor (client-side)

Inputs: persona, exposure (currency, amount/month, horizon months 1–6), risk preference {Conservative γ high, Balanced, Opportunistic γ low}.

- Volatility/correlation: EWMA (λ=0.94) on daily returns from Pyth Benchmarks history (~250 days).
- Minimum-variance ratio `h_MV = ρ·σ_e/σ_h` (=1 for direct hedges; used for cross-hedges e.g. TRY savings vs gram gold, EUR receivables vs USD).
- Cost-aware ratio (Anderson–Danthine): `h* = h_MV − (F − E[S_T]) / (γ·σ_h²·exposure)`, clamped to [0, 1]. E[S_T] default = EWMA drift estimate over lookback; shown transparently.
- Layered ladder: month1 ≤100%, month2 ≤75%, month3 ≤50%, … each scaled by h*. "Lock it" builds one transaction with one `take_offer` per rung against best offers.
- Output visual: TRY outcome distribution hedged vs unhedged across scenarios (−20%…+40% USD/TRY), cost of carry, forward vs spot.
- Disclaimer: "hedge calculator, not financial advice".

## 7. Frontend

Next.js (App Router) + TypeScript + `@solana/kit` + Wallet Standard (Phantom, Solflare, Backpack) + Codama-generated client from the Anchor IDL. Visual design produced with the **Impeccable** skill before implementation.

Pages: Onboarding/persona + devnet faucet (test USDC/USDG) · Hedge Advisor · Markets (15, spot, 30/90/180d forward, carry, best offer) · Positions (margin bar, status, add margin, waterfall view) · Maker console · Admin/demo control (devnet only). Persistent devnet/"proposed project" banner.

Errors shown before signing (insufficient margin/capacity, market closed); ladder tx is atomic.

## 8. Testing

- Unit + property tests on math (zero value at inception, long+short=0 at all prices, cross & gram composition, overflow at extremes, day-count).
- LiteSVM integration tests: full lifecycle (open → call → partial liq → waterfall → settle) for USDC (SPL Token) and USDG (Token-2022); offer cancel/capacity; stale/confidence rejection; ladder atomicity.
- Devnet end-to-end smoke run before recording.

## 9. Deployment

Program on Solana devnet (program ID in README). Mock USDC (SPL Token) and mock USDG (Token-2022) mints with faucet. Frontend on Vercel. Keeper script (Node) that marks/liquidates open positions: stretch.

## 10. Submission package

- Public GitHub repo, README (problem, how it works, architecture, devnet addresses, legal framing, prior-work disclosure).
- Pitch video script (≤3 min) and demo video storyboard (≤3 min), English.
- Demo storyboard: freelancer advisor → one-click 3-month ladder → maker view → admin shocks USD/TRY (2018/2021-style) → call → partial liq → gap → waterfall → settle in USDG → tour 15 markets incl. gram gold.
- Superteam TR: Turkey as base country on Colosseum profile, intake form, Telegram group, submission on Earn listing. Both members registered on Colosseum before deadline.

## 11. Out of scope

Mainnet, real TRY delivery/physical settlement, LP vault as universal counterparty, on-chain advisor, other sidetracks, KYC, governance token.
