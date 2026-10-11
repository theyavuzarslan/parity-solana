# Parity on Solana Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a devnet Anchor program + Vercel app for a two-sided, margined, cash-settled FX & metals forward market (15 markets, USDC/USDG collateral) with a client-side Hedge Advisor, plus the submission package, before 2026-10-12 11:59pm PT.

**Architecture:** One Anchor program `parity` holds config, rates, markets, maker offers and positions; prices come from Pyth `PriceUpdateV2` accounts kept fresh by our own price-pusher (shard 1000); a Node keeper cranks `mark`/`liquidate`/`settle`. A Next.js app (Anchor TS client + wallet-adapter) provides onboarding, Hedge Advisor (pure TS lib), markets, positions, admin/demo control and a devnet faucet.

**Tech Stack:** Rust 1.94, Anchor 1.2.1 (`anchor-lang`, `anchor-spl` with `token_interface`), Agave/Solana CLI (version per Anchor 1.2.1 compatibility matrix), LiteSVM 0.18 (Rust integration tests), Node 26, pnpm, TypeScript, `@anchor-lang/core` 1.2.1, `@solana/web3.js` 1.98, `@solana/spl-token` 0.4, `@solana/wallet-adapter-react` 0.15, Next.js (App Router) + Tailwind, vitest, `@pythnetwork/price-pusher` 11.3, `thinking-orbs` (MIT), Vercel.

**Spec:** `docs/superpowers/specs/2026-10-12-parity-solana-design.md` — read it in full before any task.

## Global Constraints

- Network: Solana **devnet** only. Test tokens only. No mainnet code paths.
- Every user-facing surface (README, app banner, pitch) states: "Proposed design · Solana devnet · test tokens only · not offered to anyone, including Turkish residents, pending legal advice." The Advisor says "hedge calculator, not financial advice".
- Product copy never uses "leverage", "kaldıraç", "forex", or "pay rent with USDC"; say "lock a rate". All content in English.
- Minimum initial margin 10% (`im_bps >= 1000`) on every market.
- Fixed point: prices and rates-derived values at `PRICE_SCALE = 100_000_000` (1e8); collateral amounts in token base units (6 decimals); bps denominator `BPS = 10_000`; i128 intermediates; multiply before divide.
- Pyth receiver program: `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`; push-oracle program: `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT`; our shard id: `1000`.
- Collateral: mock USDC = classic SPL Token mint (6 dp); mock USDG = Token-2022 mint (6 dp) with only MetadataPointer + TokenMetadata extensions. All token CPIs use `transfer_checked` via `anchor_spl::token_interface`.
- Payouts from program vaults go only to the canonical associated token account of the position's `long`/`short`, the offer's `maker`, or (liquidator reward) the signer.
- Anchor 1.2.1 API: before writing CPI code, confirm `CpiContext` constructor signatures against the installed `anchor-lang` source (`~/.cargo/registry/src/*/anchor-lang-1.2.1/src/context.rs`); code below uses `CpiContext::new_with_signer(program_account_info, accounts, seeds)` — adapt mechanically if the signature takes a `Pubkey`.
- Commit after every task with a conventional message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Weekend / market-closed prices** — FX feeds stop publishing; `mark`/`take_offer`/`settle` must fail with `MarketClosedOrStale` and the UI must show "Market closed" rather than a raw error or a frozen stale price. (Tests: Task 4 `stale_price_rejected`; Task 10 `MarketRow` closed state.)
2. **Wallet without test tokens / without SOL** — first-time judges will click "Lock it" with an empty wallet; the UI must detect zero collateral or zero SOL and route to the faucet / airdrop instead of failing at signing. (Test: Task 11 `ladder button shows faucet CTA when balance < required`.)
3. **Ladder partially valid** — one rung exceeds offer capacity or tenor range; the whole transaction must fail atomically with a readable reason before signing. (Tests: Task 6 `ladder_atomic_rollback`; Task 11 preflight validation test.)
4. **Late keeper / settlement after maturity** — `settle` called hours after maturity must use t = 0 (no negative time) and still pay out correctly. (Test: Task 7 `settle_after_maturity_clamps_time`.)
5. **Demo mode visibility** — if `demo_mode` is on, every page must show it, and real-mode reads must ignore overrides. (Tests: Task 4 `override_ignored_when_demo_off`; Task 10 banner test.)

---

## Parallel execution map

```
Task 0 (toolchain + scaffold)  ── sequential, first
 ├─ Track A (program, one agent, sequential): 1 → 2 → 3 → 4 → 5 → 6 → 7
 ├─ Track B (Advisor lib, independent): 8
 ├─ Track C (frontend): 9 (Impeccable design, with user) → 10 → 11 → 12   [10–12 need IDL from Task 7 for live calls; build against IDL stub until then]
 └─ Track D (ops, after Task 7): 13 (devnet deploy + pusher + seed) → 14 (keeper)
Then: 15 (docs + pitch package) ∥ 16 (Vercel deploy + E2E smoke)
```

---

### Task 0: Toolchain, skills and workspace scaffold

**Files:**
- Create: `Anchor.toml`, `Cargo.toml`, `programs/parity/Cargo.toml`, `programs/parity/src/lib.rs`, `.gitignore`, `rust-toolchain.toml` (only if the compatibility matrix requires a pinned toolchain), `package.json`, `pnpm-workspace.yaml`

**Interfaces:**
- Produces: buildable empty program `parity` with a fixed program ID in `declare_id!` and `Anchor.toml`; `pnpm` workspace with packages `app`, `scripts`, `advisor`.

- [ ] **Step 1: Install Solana dev skills (reference for all later tasks)**

Run: `npx skills add https://github.com/solana-foundation/solana-dev-skill`
Then read `compatibility-matrix.md` and `common-errors.md` from the installed skill and note the Solana CLI version that matches Anchor 1.2.1.

- [ ] **Step 2: Install Solana CLI (Agave) and Anchor via AVM**

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v4.3.0/install)"   # use the version the matrix names if different
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
cargo install --git https://github.com/solana-foundation/anchor avm --locked
avm install 1.2.1 && avm use 1.2.1
solana --version && anchor --version
```
Expected: both print versions; `anchor --version` → `anchor-cli 1.2.1`.

- [ ] **Step 3: Scaffold**

```bash
cd "/Users/0xatakan/Claude Code/Parity Solana"
anchor init parity-tmp --no-git --test-template rust && rsync -a parity-tmp/ ./ --exclude .git && rm -rf parity-tmp
solana config set --url devnet
solana-keygen new --no-bip39-passphrase -o ~/.config/solana/id.json   # skip if it exists
anchor keys sync
anchor build
```
Expected: `target/deploy/parity.so` and `target/idl/parity.json` exist.

- [ ] **Step 4: Add dependencies to `programs/parity/Cargo.toml`**

```toml
[dependencies]
anchor-lang = { version = "1.2.1", features = ["init-if-needed"] }
anchor-spl = { version = "1.2.1", features = ["token", "token_2022", "associated_token"] }

[dev-dependencies]
litesvm = "0.18"
solana-sdk = "*"          # use the version litesvm 0.18 re-exports/depends on; check `cargo tree -p litesvm`
spl-token = "*"           # same rule
spl-associated-token-account = "*"
proptest = "1"
```
Add `idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]` to `[features]`.

- [ ] **Step 5: pnpm workspace**

`pnpm-workspace.yaml`:
```yaml
packages: ["app", "scripts", "advisor"]
```
Root `package.json`: `{ "name": "parity-solana", "private": true, "scripts": { "test:advisor": "pnpm --filter advisor test" } }`

`.gitignore` adds: `target/`, `node_modules/`, `.anchor/`, `test-ledger/`, `.env*`, `keys/`, `.vercel`.

- [ ] **Step 6: Commit** — `chore: scaffold anchor workspace and pnpm monorepo`

---

### Task 1: Pure math module

**Files:**
- Create: `programs/parity/src/math.rs`, `programs/parity/src/constants.rs`
- Modify: `programs/parity/src/lib.rs` (add `pub mod math; pub mod constants;`)
- Test: inline `#[cfg(test)] mod tests` in `math.rs`

**Interfaces:**
- Produces (all `pub`):
  - `const PRICE_SCALE: i128 = 100_000_000; const BPS: i128 = 10_000; const SECS_PER_DAY: i64 = 86_400;`
  - `enum CompOp { None, Mul, Div }`, `enum QuoteConv { Usd, InvFeedA, InvFeedB }` (Anchor-serializable, defined in `constants.rs`? no — defined in `state.rs` in Task 2; math takes plain `u8` codes to stay pure: `op: u8` 0=None 1=Mul 2=Div, `conv: u8` 0=Usd 1=InvFeedA 2=InvFeedB)
  - `fn normalize_pyth(price: i64, expo: i32) -> Option<u64>` → price at 1e8
  - `fn compose_spot(a: u64, b: u64, op: u8, scale_num: u64, scale_den: u64) -> Option<u64>`
  - `fn usd_per_quote(a: u64, b: u64, conv: u8) -> Option<u64>`
  - `fn forward(spot: u64, r_base_bps: i64, basis_base_days: u16, r_quote_bps: i64, basis_quote_days: u16, t_secs: i64) -> Option<u64>`
  - `fn strike(fwd: u64, spread_bps: u16, taker_long: bool) -> Option<u64>`
  - `fn quantity(notional_usd: u64, spot: u64, upq: u64) -> Option<u64>`
  - `fn pnl_long_usd(qty: u64, fwd_now: u64, strike: u64, upq: u64, r_quote_bps: i64, basis_quote_days: u16, tau_secs: i64) -> Option<i128>`
  - `fn bps_of(amount: u64, bps: u16) -> u64` (floor), `fn bps_of_ceil(amount: u64, bps: u16) -> u64`

- [ ] **Step 1: Write failing tests** (append to `math.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    const S: u64 = PRICE_SCALE as u64;

    #[test] fn normalize_expo() {
        assert_eq!(normalize_pyth(111981, -5), Some(1_119_810_00));      // 1.11981
        assert_eq!(normalize_pyth(4186300, -3), Some(4186_300_000_00));   // 4186.3
        assert_eq!(normalize_pyth(-1, -5), None);
    }
    #[test] fn cross_and_gram() {
        let eurusd = 1_100_000_00; let usdtry = 42 * S;
        assert_eq!(compose_spot(eurusd, usdtry, 1, 1, 1), Some(4_620_000_000)); // 46.2
        let xau = 4000 * S;
        // gram gold TRY = 4000*42/31.1034768 = 5401.32...
        let g = compose_spot(xau, usdtry, 1, 100_000_000, 3_110_347_680).unwrap();
        assert!((g as i128 - 540_132_000_000).abs() < 100_000_000, "{g}");
        assert_eq!(compose_spot(usdtry, 0, 0, 1, 1), Some(usdtry));
    }
    #[test] fn usd_conversion() {
        assert_eq!(usd_per_quote(42 * S, 0, 1), Some(2_380_952)); // 1/42 = 0.02380952
        assert_eq!(usd_per_quote(1_100_000_00, 42 * S, 2), Some(2_380_952));
        assert_eq!(usd_per_quote(1_100_000_00, 0, 0), Some(S));
    }
    #[test] fn forward_matches_stellar_example() {
        // MXN/USD-style example from Parity Stellar: S=20, r_q=10%, r_b=4%, 90d, both 360 → 20×1.025/1.01 = 20.29703
        let f = forward(20 * S, 400, 360, 1000, 360, 90 * SECS_PER_DAY).unwrap();
        assert!((f as i128 - 2_029_702_970).abs() < 10, "{f}");
    }
    #[test] fn forward_zero_time_is_spot() {
        assert_eq!(forward(42 * S, 400, 360, 4000, 365, 0), Some(42 * S));
        assert_eq!(forward(42 * S, 400, 360, 4000, 365, -5), Some(42 * S)); // clamped
    }
    #[test] fn strike_sides() {
        assert_eq!(strike(100 * S, 50, true), Some(100_500_000_00));
        assert_eq!(strike(100 * S, 50, false), Some(99_500_000_00));
    }
    #[test] fn qty_and_pnl() {
        // $10,000 notional on USD/TRY at 42 → Q = 10,000 USD base units
        let upq = usd_per_quote(42 * S, 0, 1).unwrap();
        let q = quantity(10_000_000_000, 42 * S, upq).unwrap();
        assert!((q as i128 - 10_000_000_000).abs() <= 5_000, "{q}");
        // at maturity (tau=0), spot 46.2, strike 42 → long gains 10,000*(4.2/46.2) ≈ $909.09
        let upq_t = usd_per_quote(4_620_000_000, 0, 1).unwrap();
        let p = pnl_long_usd(q, 4_620_000_000, 42 * S, upq_t, 4000, 365, 0).unwrap();
        assert!((p - 909_090_909).abs() < 1_000_000, "{p}");
    }
    #[test] fn pnl_is_discounted_before_maturity() {
        let q = 10_000_000_000u64; let upq = usd_per_quote(42 * S, 0, 1).unwrap();
        let undiscounted = pnl_long_usd(q, 43 * S, 42 * S, upq, 4000, 365, 0).unwrap();
        let discounted = pnl_long_usd(q, 43 * S, 42 * S, upq, 4000, 365, 90 * SECS_PER_DAY).unwrap();
        assert!(discounted < undiscounted && discounted > undiscounted * 90 / 100);
    }
    #[test] fn fees() { assert_eq!(bps_of(1_000_000, 10), 1_000); assert_eq!(bps_of_ceil(1_001, 10), 2); }

    use proptest::prelude::*;
    proptest! {
        #[test] fn zero_value_at_inception(spot in 1_000_000u64..10_000 * S, r in 0i64..10_000, days in 1i64..366) {
            let f = forward(spot, 400, 360, r, 365, days * SECS_PER_DAY).unwrap();
            let p = pnl_long_usd(1_000_000_000, f, f, S, r, 365, days * SECS_PER_DAY).unwrap();
            prop_assert_eq!(p, 0);
        }
        #[test] fn no_overflow_extremes(spot in 1u64..1_000_000 * S, q in 1u64..1_000_000_000_000_000, k in 1u64..1_000_000 * S) {
            let _ = pnl_long_usd(q, spot, k, S, 50_000, 365, 365 * SECS_PER_DAY); // must not panic
        }
    }
}
```

- [ ] **Step 2: Run** `cargo test -p parity --lib math` → FAIL (functions missing).

- [ ] **Step 3: Implement `math.rs`**

```rust
pub const PRICE_SCALE: i128 = 100_000_000;
pub const BPS: i128 = 10_000;
pub const SECS_PER_DAY: i64 = 86_400;

pub fn normalize_pyth(price: i64, expo: i32) -> Option<u64> {
    if price <= 0 { return None; }
    let p = price as i128;
    let shift = 8 + expo; // target expo -8
    let v = if shift >= 0 { p.checked_mul(10i128.checked_pow(shift as u32)?)? } else { p / 10i128.checked_pow((-shift) as u32)? };
    u64::try_from(v).ok().filter(|v| *v > 0)
}

pub fn compose_spot(a: u64, b: u64, op: u8, scale_num: u64, scale_den: u64) -> Option<u64> {
    let (a, b) = (a as i128, b as i128);
    let s = match op { 0 => a, 1 => a.checked_mul(b)? / PRICE_SCALE, 2 => { if b == 0 { return None } a.checked_mul(PRICE_SCALE)? / b }, _ => return None };
    if scale_den == 0 { return None; }
    let s = s.checked_mul(scale_num as i128)? / scale_den as i128;
    u64::try_from(s).ok().filter(|v| *v > 0)
}

pub fn usd_per_quote(a: u64, b: u64, conv: u8) -> Option<u64> {
    let inv = |x: u64| -> Option<u64> { if x == 0 { None } else { u64::try_from(PRICE_SCALE * PRICE_SCALE / x as i128).ok() } };
    match conv { 0 => Some(PRICE_SCALE as u64), 1 => inv(a), 2 => inv(b), _ => None }
}

/// F = S × (B_q·1e4 + r_q·t) × B_b / (B_q × (B_b·1e4 + r_b·t)); B in seconds per year, r in bps, t in seconds (clamped ≥ 0).
pub fn forward(spot: u64, r_base_bps: i64, basis_base_days: u16, r_quote_bps: i64, basis_quote_days: u16, t_secs: i64) -> Option<u64> {
    let t = t_secs.max(0) as i128;
    let bb = basis_base_days as i128 * SECS_PER_DAY as i128;
    let bq = basis_quote_days as i128 * SECS_PER_DAY as i128;
    let num_q = bq.checked_mul(BPS)?.checked_add((r_quote_bps as i128).checked_mul(t)?)?;
    let den_b = bb.checked_mul(BPS)?.checked_add((r_base_bps as i128).checked_mul(t)?)?;
    if den_b <= 0 || num_q <= 0 { return None; }
    // (S × num_q / bq) × bb / den_b, reordered to avoid overflow: S×num_q ≤ 1e14×3e12
    let f = (spot as i128).checked_mul(num_q)?.checked_div(bq)?.checked_mul(bb)?.checked_div(den_b)?;
    u64::try_from(f).ok()
}

pub fn strike(fwd: u64, spread_bps: u16, taker_long: bool) -> Option<u64> {
    let f = fwd as i128; let s = spread_bps as i128;
    let k = if taker_long { f * (BPS + s) / BPS } else { f * (BPS - s) / BPS };
    u64::try_from(k).ok()
}

/// Q (base units, 6dp) = N (USD, 6dp) / (S × upq)
pub fn quantity(notional_usd: u64, spot: u64, upq: u64) -> Option<u64> {
    let usd_per_base = (spot as i128).checked_mul(upq as i128)? / PRICE_SCALE;
    if usd_per_base == 0 { return None; }
    u64::try_from((notional_usd as i128).checked_mul(PRICE_SCALE)? / usd_per_base).ok()
}

/// Long PnL in USD collateral units: Q(F_t−K)·upq / (1 + r_q·τ/B_q). Short = −long.
pub fn pnl_long_usd(qty: u64, fwd_now: u64, strike: u64, upq: u64, r_quote_bps: i64, basis_quote_days: u16, tau_secs: i64) -> Option<i128> {
    let quote_units = (qty as i128).checked_mul(fwd_now as i128 - strike as i128)? / PRICE_SCALE;
    let usd = quote_units.checked_mul(upq as i128)? / PRICE_SCALE;
    let bq = basis_quote_days as i128 * SECS_PER_DAY as i128 * BPS;
    let den = bq.checked_add((r_quote_bps as i128).checked_mul(tau_secs.max(0) as i128)?)?;
    if den <= 0 { return None; }
    usd.checked_mul(bq)?.checked_div(den)
}

pub fn bps_of(amount: u64, bps: u16) -> u64 { ((amount as u128 * bps as u128) / BPS as u128) as u64 }
pub fn bps_of_ceil(amount: u64, bps: u16) -> u64 { ((amount as u128 * bps as u128 + (BPS as u128 - 1)) / BPS as u128) as u64 }
```

- [ ] **Step 4: Run** `cargo test -p parity --lib math` → all PASS. If `forward_matches_stellar_example` is off by rounding, fix the implementation order, not the tolerance.

- [ ] **Step 5: Commit** — `feat(program): fixed-point pricing math with property tests`

---

### Task 2: State, errors and admin instructions

**Files:**
- Create: `programs/parity/src/state.rs`, `programs/parity/src/errors.rs`, `programs/parity/src/instructions/mod.rs`, `programs/parity/src/instructions/admin.rs`
- Modify: `programs/parity/src/lib.rs`
- Test: `programs/parity/tests/common/mod.rs`, `programs/parity/tests/admin.rs`

**Interfaces:**
- Produces account types (all `#[account] #[derive(InitSpace)]`):

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub struct RiskParams {
    pub open_fee_bps: u16,            // 10
    pub maker_fee_share_bps: u16,     // 1000 (10% of spread)
    pub liq_penalty_bps: u16,         // 100
    pub liquidator_reward_bps: u16,   // 2000 (of penalty)
    pub partial_liq_bps: u16,         // 3000
    pub call_equity_bps: u16,         // 5000
    pub liq_equity_bps: u16,          // 2000
    pub liq_confirm_marks: u8,        // 3
    pub liq_confirm_min_gap_secs: i64,// 30 (demo: 2)
    pub max_price_age_secs: i64,      // 60
    pub max_conf_bps: u16,            // 50
    pub min_notional: u64,            // 10_000_000 ($10)
}
pub struct Config { pub admin: Pubkey, pub usdc_mint: Pubkey, pub usdg_mint: Pubkey, pub demo_mode: bool, pub demo_clock_offset: i64, pub params: RiskParams, pub bump: u8 }
pub struct Rate { pub code: [u8; 3], pub rate_bps: i64, pub basis_days: u16, pub updated_at: i64, pub bump: u8 }
pub struct Market { pub id: u16, pub symbol: [u8; 12], pub base: [u8; 3], pub quote: [u8; 3], pub feed_a: [u8; 32], pub feed_b: [u8; 32], pub op: u8, pub scale_num: u64, pub scale_den: u64, pub quote_conv: u8, pub im_bps: u16, pub active: bool, pub bump: u8 }
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default)]
pub struct DemoPrice { pub a: u64, pub b: u64, pub set: bool }
pub struct DemoState { pub prices: [DemoPrice; 16], pub bump: u8 }
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub enum Side { Long, Short }
pub struct MakerOffer { pub maker: Pubkey, pub nonce: u64, pub market_id: u16, pub mint: Pubkey, pub maker_side: Side, pub spread_bps: u16, pub min_tenor_days: u16, pub max_tenor_days: u16, pub capacity_usd: u64, pub margin_locked: u64, pub position_counter: u64, pub active: bool, pub bump: u8 }
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub enum Status { Open, Called, PartiallyLiquidated, Settled, Liquidated }
pub struct Position { pub offer: Pubkey, pub index: u64, pub long: Pubkey, pub short: Pubkey, pub market_id: u16, pub mint: Pubkey, pub notional_usd: u64, pub qty: u64, pub strike: u64, pub opened_at: i64, pub maturity: i64, pub im_per_side: u64, pub margin_long: u64, pub margin_short: u64, pub status: Status, pub breach_count: u8, pub last_breach_time: i64, pub last_publish_time: i64, pub bump: u8 }
```
- Seeds: `Config [b"config"]`, `Rate [b"rate", code]`, `Market [b"market", id.to_le_bytes()]`, `DemoState [b"demo"]`, `Vault [b"vault", mint]`, `Insurance [b"insurance", mint]`, `MakerOffer [b"offer", maker, nonce.to_le_bytes()]`, `Position [b"position", offer, index.to_le_bytes()]`.
- Instructions: `initialize(params: RiskParams)`, `set_params(params)`, `set_rate(code: [u8;3], rate_bps: i64, basis_days: u16)`, `upsert_market(args: MarketArgs)`, `set_demo_mode(on: bool)`, `set_demo_price(market_id: u16, a: u64, b: u64, set: bool)`, `set_demo_clock(offset_secs: i64)`, `fund_insurance(amount: u64)`, `init_collateral()` (creates vault+insurance token accounts for one allowed mint).
- `fn effective_now(config: &Config) -> Result<i64>` = `Clock::get()?.unix_timestamp + if config.demo_mode { config.demo_clock_offset } else { 0 }` (in `state.rs`).
- Errors (`errors.rs`, `#[error_code] pub enum ParityError`): `Unauthorized, DemoModeOff, MathOverflow, InvalidMarket, MarketInactive, InvalidMint, WrongFeed, NotPythAccount, MarketClosedOrStale, OracleConfidence, StalePublishTime, InvalidTenor, BelowMinNotional, InsufficientCapacity, OfferInactive, NotLiquidatable, NotConfirmed, NotMatured, PositionClosed, InvalidParams, MarginTooLow`.

- [ ] **Step 1: LiteSVM harness** `programs/parity/tests/common/mod.rs` — functions: `setup() -> Ctx` (loads `../../target/deploy/parity.so` at the program id, airdrops admin/maker/taker, creates mock USDC (spl-token) and USDG (token-2022) mints with admin as mint authority, mints 1,000,000 of each to maker/taker), `send(ctx, ixs, signers) -> Result<(), FailedTransactionMetadata>`, `pda(seeds) -> Pubkey`, `default_params() -> RiskParams` (values in comments above, `liq_confirm_min_gap_secs: 2`), `write_price_update(ctx, addr, feed_id, price, conf, expo, publish_time)` writing a 134-byte account owned by `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` with layout: `[0..8] discriminator 22f123639d7ef4cd`, `[8..40] write_authority`, `[40] verification=1 (Full)`, `[41..73] feed_id`, `[73..81] price i64 LE`, `[81..89] conf u64`, `[89..93] expo i32`, `[93..101] publish_time i64`, `[101..109] prev_publish_time`, `[109..117] ema_price`, `[117..125] ema_conf`, `[125..133] posted_slot`; `warp_time(ctx, unix_ts)` via `svm.set_sysvar::<Clock>`. Instructions are built with `parity::instruction::X { .. }.data()` and `parity::accounts::X { .. }.to_account_metas(None)`.

- [ ] **Step 2: Failing tests** `programs/parity/tests/admin.rs`:

```rust
mod common; use common::*;
#[test] fn initialize_and_set_rate() {
    let mut c = setup(); init_all(&mut c); // initialize + init_collateral(USDC) + init_collateral(USDG) + demo state
    set_rate(&mut c, *b"TRY", 4000, 365).unwrap();
    let r: parity::state::Rate = c.fetch(pda(&[b"rate", b"TRY"]));
    assert_eq!((r.rate_bps, r.basis_days), (4000, 365));
}
#[test] fn non_admin_rejected() {
    let mut c = setup(); init_all(&mut c);
    let err = set_rate_as(&mut c, &c.taker.insecure_clone(), *b"TRY", 1, 365).unwrap_err();
    assert_error(err, "Unauthorized");
}
#[test] fn market_im_floor_enforced() {
    let mut c = setup(); init_all(&mut c);
    let mut m = usd_try_market_args(); m.im_bps = 800;
    assert_error(upsert_market(&mut c, m).unwrap_err(), "InvalidParams");
}
#[test] fn demo_ixs_require_demo_mode() {
    let mut c = setup(); init_all(&mut c);
    assert_error(set_demo_price(&mut c, 0, 1, 1, true).unwrap_err(), "DemoModeOff");
    set_demo_mode(&mut c, true).unwrap();
    set_demo_price(&mut c, 0, 42 * 100_000_000, 0, true).unwrap();
}
#[test] fn wrong_mint_rejected_for_collateral() {
    let mut c = setup(); init_all(&mut c);
    let rogue = create_spl_mint(&mut c);
    assert_error(init_collateral(&mut c, rogue).unwrap_err(), "InvalidMint");
}
```

- [ ] **Step 3: Run** `anchor build && cargo test -p parity --test admin` → FAIL.

- [ ] **Step 4: Implement** `state.rs` (types above + `effective_now`), `errors.rs`, `instructions/admin.rs`. Key validation (`upsert_market`): `im_bps >= 1000`, `op <= 2`, `quote_conv <= 2`, `scale_den > 0`, `id < 16`; `initialize` stores `usdc_mint`, `usdg_mint` (passed as accounts) and creates `DemoState`; `init_collateral` requires `mint == usdc_mint || mint == usdg_mint` and inits:

```rust
#[account(init, payer = admin, seeds = [b"vault", mint.key().as_ref()], bump,
    token::mint = mint, token::authority = config, token::token_program = token_program)]
pub vault: InterfaceAccount<'info, TokenAccount>,
#[account(init, payer = admin, seeds = [b"insurance", mint.key().as_ref()], bump,
    token::mint = mint, token::authority = config, token::token_program = token_program)]
pub insurance: InterfaceAccount<'info, TokenAccount>,
```
Admin check on every admin ix: `#[account(seeds=[b"config"], bump=config.bump, has_one = admin @ ParityError::Unauthorized)]`. Demo ixs additionally `require!(config.demo_mode, ParityError::DemoModeOff)` (except `set_demo_mode`).

- [ ] **Step 5: Run** → PASS. **Step 6: Commit** — `feat(program): state accounts and admin instructions`

---

### Task 3: Oracle adapter

**Files:**
- Create: `programs/parity/src/oracle.rs`
- Test: inline unit tests + `programs/parity/tests/oracle.rs` (via a tiny `debug_price(market_id)` view instruction that emits `PriceRead` event — keep it, it is useful for the app)

**Interfaces:**
- Produces:
```rust
pub struct PriceRead { pub a: u64, pub b: u64, pub spot: u64, pub upq: u64, pub publish_time: i64 }
pub fn read_market_price(config: &Config, market: &Market, demo: &DemoState, price_a: &AccountInfo, price_b: &AccountInfo, now: i64) -> Result<PriceRead>
pub fn parse_price_update(acc: &AccountInfo) -> Result<(/*feed_id*/[u8;32], /*price*/i64, /*conf*/u64, /*expo*/i32, /*publish_time*/i64)>
pub const PYTH_RECEIVER: Pubkey = pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
```

Behaviour:
1. If `config.demo_mode && demo.prices[market.id].set` → use demo `a`, `b`, `publish_time = now`; skip accounts entirely.
2. Else for feed A (and feed B when `market.op != 0` or `market.quote_conv == 2`): `acc.owner == PYTH_RECEIVER` else `NotPythAccount`; data len ≥ 133, discriminator `22f123639d7ef4cd` else `NotPythAccount`; `data[40] == 1` (Full) else `WrongFeed`; feed id bytes equal market feed else `WrongFeed`; `now - publish_time <= max_price_age_secs` else `MarketClosedOrStale`; `conf * 10_000 <= price * max_conf_bps` else `OracleConfidence`; normalise with `math::normalize_pyth`.
3. `publish_time = min(pt_a, pt_b)`; compute `spot = compose_spot(...)`, `upq = usd_per_quote(...)`.

- [ ] **Step 1: Failing tests** (`tests/oracle.rs`): `reads_fresh_price`, `stale_price_rejected` (publish_time = now − 61 → `MarketClosedOrStale`), `wrong_feed_rejected` (BTC feed id in USD/TRY slot → `WrongFeed`), `fake_owner_rejected` (same bytes, owner = system program → `NotPythAccount`), `wide_confidence_rejected`, `demo_override_used_when_on`, `override_ignored_when_demo_off` (override set, then demo turned off → real price used), `cross_requires_both_feeds` (EUR/TRY with feed B missing → error).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `oracle.rs` per behaviour above (read fields at the offsets listed in Task 2 Step 1). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(program): pyth price adapter with feed/owner/staleness/confidence checks`

---

### Task 4: Maker offers

**Files:**
- Create: `programs/parity/src/instructions/offer.rs`
- Test: `programs/parity/tests/offer.rs`

**Interfaces:**
- Produces: `create_offer(nonce: u64, market_id: u16, maker_side: Side, spread_bps: u16, min_tenor_days: u16, max_tenor_days: u16, capacity_usd: u64)` — transfers `margin_locked = bps_of_ceil(capacity_usd, market.im_bps) + bps_of_ceil(bps_of_ceil(capacity_usd, spread_bps), maker_fee_share_bps)` from maker ATA to vault; `cancel_offer()` — sets `active=false`, returns `margin_locked` to maker's canonical ATA, sets `margin_locked = 0`.
- Validation: `1 <= min_tenor_days <= max_tenor_days <= 365`, `spread_bps <= 500`, `capacity_usd >= params.min_notional`, `market.active`, mint ∈ {usdc, usdg}.
- Accounts for `cancel_offer` include `#[account(mut, associated_token::mint = mint, associated_token::authority = offer.maker, associated_token::token_program = token_program)] maker_ata`.

- [ ] **Step 1: Failing tests**: `create_locks_margin` (capacity $100k, im 10%, spread 20bps, share 10% → locked = 10_000_000_000 + 20_000_000), `cancel_returns_margin`, `cancel_by_non_maker_rejected`, `tenor_bounds_validated`, `usdg_offer_works` (Token-2022 mint path).
- [ ] **Step 2–4:** run (FAIL) → implement → run (PASS).
- [ ] **Step 5: Commit** — `feat(program): maker offers with locked margin`

---

### Task 5: take_offer (open position) + ladder atomicity

**Files:**
- Create: `programs/parity/src/instructions/take.rs`
- Test: `programs/parity/tests/take.rs`

**Interfaces:**
- Consumes: `oracle::read_market_price`, `math::{forward, strike, quantity, bps_of_ceil}`, `state::*`.
- Produces: `take_offer(notional_usd: u64, tenor_days: u16)` creating `Position` at seeds `[b"position", offer.key(), offer.position_counter.to_le_bytes()]`; emits `PositionOpened { position, market_id, long, short, notional_usd, strike, maturity }`.

Logic:
```rust
let now = effective_now(&config)?;
let px = read_market_price(&config, &market, &demo, &price_a, &price_b, now)?;
require!(offer.active, OfferInactive);
require!(tenor_days >= offer.min_tenor_days && tenor_days <= offer.max_tenor_days, InvalidTenor);
require!(notional_usd >= params.min_notional, BelowMinNotional);
require!(notional_usd <= offer.capacity_usd, InsufficientCapacity);
let t = tenor_days as i64 * SECS_PER_DAY;
let f = forward(px.spot, rate_base.rate_bps, rate_base.basis_days, rate_quote.rate_bps, rate_quote.basis_days, t).ok_or(MathOverflow)?;
let taker_long = offer.maker_side == Side::Short;
let k = strike(f, offer.spread_bps, taker_long)?;
let qty = quantity(notional_usd, px.spot, px.upq)?;
let im = bps_of_ceil(notional_usd, market.im_bps);
let maker_fee = bps_of_ceil(bps_of_ceil(notional_usd, offer.spread_bps), params.maker_fee_share_bps);
require!(offer.margin_locked >= im + maker_fee, InsufficientCapacity);
offer.margin_locked -= im + maker_fee; offer.capacity_usd -= notional_usd; offer.position_counter += 1;
// taker: im → vault, open fee → insurance (both transfer_checked, authority = taker)
// maker fee: vault → insurance (signed by config PDA)
position = { long: if taker_long {taker} else {offer.maker}, short: the other, qty, strike: k, opened_at: now, maturity: now + t,
             im_per_side: im, margin_long: im, margin_short: im, status: Open, last_publish_time: px.publish_time, .. };
```
Account constraints: `rate_base` seeds `[b"rate", market.base.as_ref()]`, `rate_quote` seeds `[b"rate", market.quote.as_ref()]`, `offer.market_id == market.id`, `offer.mint == mint.key()`, `vault`/`insurance` seeds with `mint`, `taker_ata` `token::mint = mint, token::authority = taker`.

- [ ] **Step 1: Failing tests**: `open_usd_try_position` (assert strike = forward ± spread, margins, fee to insurance, capacity reduced), `strike_side_convention`, `tenor_out_of_range_rejected`, `below_min_notional_rejected`, `stale_price_rejected` (wrapper around oracle error through take), `ladder_atomic_rollback` (one tx: 3 take_offer ixs with counters n, n+1, n+2, third exceeds capacity → whole tx fails, no positions exist, balances unchanged), `ladder_three_rungs_succeeds`, `gram_gold_market_opens` (GAU/TRY with two feeds).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** — `feat(program): take_offer opens margined forward positions`

---

### Task 6: Margin, mark and add_margin

**Files:**
- Create: `programs/parity/src/instructions/risk.rs` (mark, add_margin), `programs/parity/src/waterfall.rs`
- Test: inline tests in `waterfall.rs`; `programs/parity/tests/mark.rs`

**Interfaces:**
- Produces:
```rust
// waterfall.rs (pure)
pub struct Allocation { pub from_loser: u64, pub from_insurance: u64, pub shortfall: u64 }
pub fn allocate_loss(owed: u64, loser_margin: u64, insurance: u64) -> Allocation
pub fn loser_equity(margin: u64, pnl_for_side: i128) -> i128 // margin + pnl
// risk.rs helper reused by Task 7
pub fn evaluate(position: &Position, market: &Market, rb: &Rate, rq: &Rate, px: &PriceRead, now: i64) -> Result<(i128 /*pnl_long*/, Side /*loser*/, i128 /*loser_equity*/)>
```
- `mark()`: requires status ∈ {Open, Called, PartiallyLiquidated}; `px.publish_time > position.last_publish_time` else `StalePublishTime`; τ = `max(maturity − now, 0)`; `F_t = forward(spot, …, τ)`; `pnl_long = pnl_long_usd(qty, F_t, strike, upq, rq.rate_bps, rq.basis_days, τ)`; loser equity vs `im_per_side`: `< call_equity_bps` → `Called` (unless already PartiallyLiquidated), else `Open` (unless PartiallyLiquidated); if `< liq_equity_bps`: if `now − last_breach_time >= liq_confirm_min_gap_secs` then `breach_count += 1; last_breach_time = now`; else (healthy) `breach_count = 0`. Sets `last_publish_time`. Emits `Marked { position, pnl_long, loser_equity, status, breach_count }`.
- `add_margin(side: Side, amount: u64)`: signer must equal `position.long`/`short` for that side; transfers to vault; increments margin.

- [ ] **Step 1: Failing tests**: waterfall unit tests `covered_by_margin`, `insurance_second`, `shortfall_haircut`; integration `margin_call_fires` (USD/TRY at 42, 10% IM, taker long; move spot so loss ≈ 60% of IM → status Called), `breach_count_requires_gap_and_fresh_price` (two marks with same publish_time → second fails `StalePublishTime`; marks 1s apart with gap 2 → count stays), `healthy_mark_resets_breach`, `add_margin_restores_open`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** — `feat(program): mark-to-market, margin calls, add_margin`

---

### Task 7: Liquidate and settle (waterfall, payouts)

**Files:**
- Create: `programs/parity/src/instructions/close.rs`
- Test: `programs/parity/tests/lifecycle.rs`

**Interfaces:**
- Consumes: `risk::evaluate`, `waterfall::allocate_loss`.
- Produces: `liquidate()` and `settle()`; events `PartiallyLiquidated`, `Liquidated`, `Settled { position, pnl_long, from_loser, from_insurance, shortfall }`.

`liquidate()` (caller = any signer):
1. `require!(position.breach_count >= params.liq_confirm_marks, NotConfirmed)`; read price (publish_time ≥ last); `evaluate`; require loser equity `< liq_equity_bps × im` else `NotLiquidatable`.
2. If status != PartiallyLiquidated → **partial**: `frac = partial_liq_bps`; `realized = |pnl_long| × frac / BPS`; `alloc = allocate_loss(realized, loser_margin, insurance.amount)`; loser margin −= `from_loser`; winner margin += `from_loser + from_insurance` (transfer insurance→vault `from_insurance`); `closed_notional = notional × frac / BPS`; `penalty = min(bps_of(closed_notional, liq_penalty_bps), loser margin)`; loser margin −= penalty; reward = `bps_of(penalty, liquidator_reward_bps)` vault→caller ATA; `penalty − reward` vault→insurance; scale `qty`, `notional_usd`, `im_per_side` by `(BPS − frac)/BPS`; strike unchanged; status `PartiallyLiquidated`; `breach_count = 0`. Then re-evaluate with the reduced position: if loser equity still `< liq_equity_bps × new im` → fall through to full close.
3. **Full close**: `alloc = allocate_loss(|pnl_long|, loser_margin, insurance.amount)`; penalty on remaining notional as above (from loser margin after alloc); payouts: vault→winner ATA `winner_margin + from_loser`, insurance→winner ATA `from_insurance`, vault→loser ATA remaining loser margin; zero both margins; status `Liquidated`.

`settle()` (anyone): `require!(now >= maturity, NotMatured)`; status not Settled/Liquidated; read price; τ = 0 so `F_t = spot`; full-close payout path without penalty; status `Settled`.

Payout account constraints (both ixs):
```rust
#[account(mut, associated_token::mint = mint, associated_token::authority = position.long, associated_token::token_program = token_program)]
pub long_ata: InterfaceAccount<'info, TokenAccount>,
#[account(mut, associated_token::mint = mint, associated_token::authority = position.short, associated_token::token_program = token_program)]
pub short_ata: InterfaceAccount<'info, TokenAccount>,
```
Vault/insurance transfers are signed with `&[&[b"config", &[config.bump]]]`.

- [ ] **Step 1: Failing tests** (`lifecycle.rs`):
  - `full_lifecycle_usdc`: open USD/TRY 90d at 42 → shock to call → 3 confirmed breaches → partial liquidation (30%, insurance untouched, caller gets reward) → gap to a price where loser margin < loss → full liquidation drains insurance then haircuts winner; assert vault + insurance + all ATAs conserve total tokens exactly.
  - `settle_at_maturity_pays_difference`: warp clock past maturity, settle, assert payouts = margins ± pnl.
  - `settle_after_maturity_clamps_time`: settle 10 days after maturity, same result as at maturity for same price.
  - `settle_before_maturity_rejected`.
  - `payout_redirect_rejected`: pass attacker's ATA as `long_ata` → constraint error.
  - `liquidate_without_confirmation_rejected`.
  - `usdg_open_and_settle` (Token-2022).
- [ ] **Step 2–4:** FAIL → implement → PASS. Then `cargo test -p parity` (all) → PASS; `anchor build` → IDL at `target/idl/parity.json`.
- [ ] **Step 5: Commit** — `feat(program): liquidation, settlement and loss waterfall`

---

### Task 8: Hedge Advisor library (pure TS)

**Files:**
- Create: `advisor/package.json`, `advisor/src/index.ts`, `advisor/src/advisor.ts`, `advisor/src/vol.ts`, `advisor/test/advisor.test.ts`, `advisor/scripts/build-vol.ts`, `advisor/src/vol.json`

**Interfaces:**
- Produces:
```ts
export type Direction = 'sell' | 'buy';           // sell base forward (USD earner) | buy base forward (importer/saver)
export type Risk = 'conservative' | 'balanced' | 'opportunistic';
export const GAMMA: Record<Risk, number> = { conservative: 20, balanced: 6, opportunistic: 2 };
export function forwardPrice(spot: number, rBase: number, basisBase: number, rQuote: number, basisQuote: number, days: number): number;
export function expectedSpot(spot: number, driftAnnual: number, days: number): number; // spot*(1+drift*days/365)
export function hedgeRatio(p: { direction: Direction; spot: number; forward: number; expected: number; sigmaAnnual: number; days: number; risk: Risk }): number;
  // premium = (forward-expected)/spot; v = sigma^2*days/365; h = 1 ± premium/(GAMMA*v); clamp [0,1]; sign + for 'sell', − for 'buy'
export function ladder(p: { months: number; monthlyExposure: number; h: number }): { month: number; tenorDays: number; amount: number; fraction: number }[];
  // fractions [1, .75, .5, .5, .5, .5].slice(0, months) × h; tenorDays = 30*month
export function scenarios(p: { exposure: number; strike: number; spot: number; shocks: number[] }): { shock: number; unhedged: number; hedged: number }[];
export function ewma(returns: number[], lambda?: number): number; // annualised: sqrt(var*252)
export type VolEntry = { sigmaAnnual: number; driftAnnual: number; asOf: string };
export const VOL: Record<string, VolEntry>;  // keyed by market symbol e.g. 'USD/TRY'
```

- [ ] **Step 1: Failing tests** (`advisor/test/advisor.test.ts`, vitest):
```ts
import { describe, it, expect } from 'vitest';
import { forwardPrice, hedgeRatio, ladder, scenarios, ewma } from '../src';
describe('advisor', () => {
  it('forward matches program example', () => { expect(forwardPrice(20, 0.04, 360, 0.10, 360, 90)).toBeCloseTo(20.2970, 3); });
  it('seller with positive premium hedges fully', () => {
    expect(hedgeRatio({ direction: 'sell', spot: 42, forward: 45.8, expected: 45.0, sigmaAnnual: 0.15, days: 90, risk: 'balanced' })).toBe(1);
  });
  it('buyer facing expensive carry hedges less', () => {
    const h = hedgeRatio({ direction: 'buy', spot: 42, forward: 45.8, expected: 45.0, sigmaAnnual: 0.15, days: 90, risk: 'balanced' });
    expect(h).toBeGreaterThan(0); expect(h).toBeLessThan(1);
  });
  it('more risk-averse buyer hedges more', () => {
    const base = { direction: 'buy' as const, spot: 42, forward: 45.8, expected: 45.0, sigmaAnnual: 0.15, days: 90 };
    expect(hedgeRatio({ ...base, risk: 'conservative' })).toBeGreaterThan(hedgeRatio({ ...base, risk: 'opportunistic' }));
  });
  it('ladder decays', () => {
    expect(ladder({ months: 3, monthlyExposure: 3000, h: 1 }).map(r => r.amount)).toEqual([3000, 2250, 1500]);
  });
  it('hedged outcome is flat across shocks', () => {
    const s = scenarios({ exposure: 3000, strike: 45, spot: 42, shocks: [-0.2, 0, 0.4] });
    expect(new Set(s.map(x => Math.round(x.hedged))).size).toBe(1);
  });
  it('ewma of constant returns is zero', () => { expect(ewma([0, 0, 0, 0])).toBe(0); });
});
```
- [ ] **Step 2:** `pnpm --filter advisor test` → FAIL. **Step 3:** implement `advisor.ts`, `vol.ts`, `index.ts`. **Step 4:** → PASS.
- [ ] **Step 5: vol.json generator** `advisor/scripts/build-vol.ts`: for each of the 12 Pyth symbols fetch `https://benchmarks.pyth.network/v1/shims/tradingview/history?symbol=<SYMBOL>&resolution=D&from=<now-400d>&to=<now>` (`{ t: number[], c: number[] }`), compute daily log returns, `sigmaAnnual = ewma(returns)`, `driftAnnual = mean(returns)*252`; derive crosses (EUR/TRY, GBP/TRY, GAU/TRY) from component series aligned by date; write `advisor/src/vol.json` with `asOf`. Run `pnpm --filter advisor tsx scripts/build-vol.ts`; commit the JSON.
- [ ] **Step 6: Commit** — `feat(advisor): cost-aware hedge ratio, ladder and scenarios`

---

### Task 9: Frontend design with Impeccable (with the user, time-boxed 60 min)

**Files:**
- Create: `app/DESIGN.md` (brand file + tokens + page specs), `app/design/*.png` (mock screenshots, optional)

- [ ] **Step 1:** Invoke `impeccable:impeccable` with: product = Parity (lock a future FX/gold rate; audience Turkish freelancers, SMEs, savers; judges); pages per spec §7; constraints from Global Constraints (banner, copy rules, phone width); loading states use `thinking-orbs`; landing hero may use a `p5.brush` hand-painted USD/TRY line. Produce a **brand file** first (voice, palette tokens light/dark, type scale, spacing, motion), then page layouts for: Onboarding, Advisor, Markets, Positions, Admin.
- [ ] **Step 2:** Show the user the brand file and Advisor + Markets layouts; apply their feedback once.
- [ ] **Step 3:** Save `app/DESIGN.md` with exact tokens (CSS variables), component inventory (`Banner`, `PersonaPicker`, `AdvisorForm`, `RiskSlider`, `LadderTable`, `ScenarioChart`, `MarketRow`, `PositionCard`, `MarginBar`, `WaterfallView`, `DemoControls`, `FaucetButton`, `Orb`). **Commit** — `docs(app): design brief from impeccable`

---

### Task 10: App scaffold, wallet, chain client, banner, faucet

**Files:**
- Create: `app/` (Next.js App Router, TS, Tailwind), `app/src/lib/idl/parity.json` (copied from `target/idl`), `app/src/lib/program.ts`, `app/src/lib/markets.ts`, `app/src/lib/pda.ts`, `app/src/lib/prices.ts`, `app/src/components/{Providers,Banner,WalletButton,FaucetButton,Orb,MarketRow}.tsx`, `app/src/app/api/faucet/route.ts`, `app/src/app/{layout,page}.tsx`, `app/src/app/markets/page.tsx`
- Test: `app/test/*.test.tsx` (vitest + @testing-library/react)

**Interfaces:**
- Produces:
```ts
// markets.ts — single source of market metadata for app, scripts and keeper (scripts import from here)
export type MarketMeta = { id: number; symbol: string; base: string; quote: string; feedA: string; feedB?: string; op: 0|1|2; scaleNum: bigint; scaleDen: bigint; quoteConv: 0|1|2; imBps: number; demo: boolean };
export const MARKETS: MarketMeta[];  // 15 entries per spec §2; feed ids below
export const RATES: { code: string; basisDays: 360|365 }[];
// pda.ts
export const PROGRAM_ID: PublicKey; export function configPda(): PublicKey; ratePda(code): PublicKey; marketPda(id): PublicKey; demoPda(); vaultPda(mint); insurancePda(mint); offerPda(maker, nonce: bigint); positionPda(offer, index: bigint); priceFeedPda(feedIdHex, shard = 1000): PublicKey;
// program.ts
export function useParity(): { program: Program<Parity> | null; connection: Connection; wallet: AnchorWallet | null };
// prices.ts
export function useHermesPrices(feedIds: string[]): Record<string, { price: number; publishTime: number; closed: boolean }>; // polls https://hermes.pyth.network/v2/updates/price/latest every 5s; closed = now - publishTime > 120
```
Feed ids (hex, no 0x): USD/TRY `032a2eba1c2635bf973e95fb62b2c0705c1be2603b9572cc8d5edeaf8744e058`, EUR/USD `a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b`, GBP/USD `84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1`, USD/CHF `0b1e3297e69f162877b577b0d6a47a0d63b2392bc8499e6540da4187a63e28f8`, USD/JPY `ef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52`, USD/CNH `eef52e09c878ad41f6a81803e3640fe04dceea727de894edd4ea117e2e332e66`, USD/MXN `e13b1c1ffb32f34e1be9545583f01ef385fde7f42ee66049d30570dc866b77ca`, USD/BRL `d2db4dbf1aea74e0f666b0e8f73b9580d407f5e5cf931940b06dc633d7a95906`, USD/ZAR `389d889017db82bf42141f23b61b8de938a4e2d156e36312175bebf797f493f1`, USD/INR `0ac0f9a2886fc2dd708bc66cc2cea359052ce89d324f45d95fadbc6c4fcf1809`, XAU/USD `765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2`, XAG/USD `f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e`.

- [ ] **Step 1: Failing tests**: `Banner shows devnet + proposed-project text and DEMO MODE badge when demoMode=true`; `MarketRow shows "Market closed" when price.closed`; `priceFeedPda matches known shard-0 address Fu76ChamBDjE8UuGLV6GP2AcPPSU6gjhkNhAyuoPm7ny for EUR/USD when shard=0`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. Faucet route: POST `{ owner }` → server loads `FAUCET_SECRET_KEY` (devnet mint authority, env) and mints 10,000 test USDC + 10,000 test USDG to the owner's ATAs (creating them, correct token program per mint), max once per owner per 10 minutes (in-memory map). Also exposes "Get devnet SOL" link to `https://faucet.solana.com`. **Step 4:** PASS; `pnpm --filter app build` succeeds.
- [ ] **Step 5: Commit** — `feat(app): scaffold, wallet, markets page, faucet`

---

### Task 11: Onboarding + Hedge Advisor page + one-click ladder

**Files:**
- Create: `app/src/app/advisor/page.tsx`, `app/src/components/{PersonaPicker,AdvisorForm,RiskSlider,LadderTable,ScenarioChart}.tsx`, `app/src/lib/ladderTx.ts`
- Test: `app/test/ladder.test.ts`, `app/test/advisor-page.test.tsx`

**Interfaces:**
- Consumes: `advisor` package, `MARKETS`, `useParity`, `pda.ts`.
- Produces:
```ts
export type Rung = { tenorDays: number; notionalUsd: bigint };
export type OfferView = { pubkey: PublicKey; maker: PublicKey; makerSide: 'long'|'short'; spreadBps: number; minTenor: number; maxTenor: number; capacityUsd: bigint; marginLocked: bigint; positionCounter: bigint; mint: PublicKey };
export function pickOffer(offers: OfferView[], takerLong: boolean, mint: PublicKey, rungs: Rung[]): OfferView | null; // tightest spread covering all rungs (capacity sum, tenor range)
export function preflight(p: { rungs: Rung[]; offer: OfferView | null; collateralBalance: bigint; solLamports: number; imBps: number; openFeeBps: number }): { ok: true } | { ok: false; reason: 'NO_OFFER'|'NEED_SOL'|'NEED_COLLATERAL'|'CAPACITY'|'TENOR'; message: string };
export async function buildLadderTx(program: Program<Parity>, p: { taker: PublicKey; market: MarketMeta; offer: OfferView; rungs: Rung[] }): Promise<Transaction>; // one take_offer ix per rung, position PDAs at offer.positionCounter + i
```
Persona → direction mapping: Freelancer & Exporter → `sell` USD (taker short USD/TRY, i.e., takes a maker-long offer), Importer → `buy`, Saver → `buy` GAU/TRY (labelled "Proposed future product").

- [ ] **Step 1: Failing tests**: `pickOffer chooses tightest spread with enough capacity`; `preflight returns NEED_COLLATERAL when balance < sum(im)+fees` (the "ladder button shows faucet CTA when balance < required" Review Focus test, asserted on the rendered page too); `preflight CAPACITY when sum rungs > offer capacity`; `buildLadderTx produces N instructions with consecutive position PDAs`.
- [ ] **Step 2:** FAIL. **Step 3:** implement the page per `app/DESIGN.md`: persona picker → exposure form (amount/month, months 1–6, currency pair from persona) → shows spot, forward, carry %, σ, h*, ladder table, scenario chart, disclaimer → "Lock it" (preflight → sign → confirm with `Orb` while pending → link to Positions). **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(app): hedge advisor with one-click ladder`

---

### Task 12: Positions + Admin/demo pages

**Files:**
- Create: `app/src/app/positions/page.tsx`, `app/src/app/admin/page.tsx`, `app/src/components/{PositionCard,MarginBar,WaterfallView,DemoControls}.tsx`
- Test: `app/test/positions.test.tsx`

**Interfaces:**
- Consumes: program accounts `Position`, events `Marked/PartiallyLiquidated/Liquidated/Settled` (read via `program.addEventListener` and recent tx logs).
- Produces: Positions page lists the wallet's positions (memcmp on `long` or `short`), shows status chip, margin bar (equity vs IM with call 50% and liquidation 20% markers), PnL in USD, maturity countdown, `add_margin` button, and `WaterfallView` (loser margin → insurance → haircut amounts) for liquidated/settled ones. Admin page (visible only when wallet == config.admin): demo mode toggle, per-market price shock buttons (−5%, +5%, +12% gap), clock +30d/+90d, rate editor, "Mark now"/"Liquidate"/"Settle" crank buttons.

- [ ] **Step 1: Failing tests**: `MarginBar marks call and liquidation thresholds`; `WaterfallView sums equal owed`; `admin page hidden for non-admin`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** — `feat(app): positions and admin demo control`

---

### Task 13: Devnet deploy, price-pusher, seed data

**Files:**
- Create: `scripts/package.json`, `scripts/src/{env.ts,01-mints.ts,02-init.ts,03-rates-markets.ts,04-offers.ts,05-insurance.ts}`, `scripts/pusher/price-config.yaml`, `scripts/pusher/run.sh`, `docs/rates.md`, `docs/devnet.md`

- [ ] **Step 1: Rates research** — collect current policy rates (TCMB, Fed, ECB, BoE, SNB, BoJ, PBoC 1y LPR as CNH proxy, Banxico, BCB Selic, SARB, RBI) and gold/silver lease-rate proxies; record value, date and source URL per code in `docs/rates.md`.
- [ ] **Step 2: Deploy** — `solana airdrop 5` (repeat / use faucet as needed); `anchor deploy --provider.cluster devnet`; `anchor idl init --filepath target/idl/parity.json <PROGRAM_ID> --provider.cluster devnet`. Record program id in `docs/devnet.md`.
- [ ] **Step 3: Scripts** (run with `pnpm --filter scripts tsx src/0X-*.ts`): `01-mints` creates mock USDC (SPL Token, 6dp) and mock USDG (Token-2022, 6dp, MetadataPointer+TokenMetadata name "Test USDG"), writes `keys/mints.json`; `02-init` → `initialize` with default params (devnet: `liq_confirm_min_gap_secs = 30`), `init_collateral` ×2; `03-rates-markets` → 13 `set_rate`, 15 `upsert_market` from `app/src/lib/markets.ts`; `04-offers` → maker keypair (`keys/maker.json`) creates, per market, one maker-long and one maker-short offer in USDC (spread 15 bps majors, 40 bps TRY/EM/metals; tenors 7–180; capacity $250k) and the same for USDG on the 5 demo markets; `05-insurance` → `fund_insurance` $25k per mint.
- [ ] **Step 4: Price pusher** — `scripts/pusher/price-config.yaml` lists the 12 feeds (`alias`, `id`, `time_difference: 15`, `price_deviation: 0.1`, `confidence_ratio: 1`). `run.sh`: `npx @pythnetwork/price-pusher@11.3.0 solana --endpoint https://api.devnet.solana.com --keypair-file keys/pusher.json --shard-id 1000 --price-config-file scripts/pusher/price-config.yaml --price-service-endpoint https://hermes.pyth.network --pyth-contract-address pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT --pushing-frequency 15` — **first run `--help` and correct any flag names**. Fund `keys/pusher.json` with devnet SOL.
- [ ] **Step 5: Verify** — node one-liner reads `priceFeedPda(USD/TRY, 1000)`; publish_time age < 30 s. Call `debug_price(0)` → event with plausible spot.
- [ ] **Step 6: Commit** (no secrets; `keys/` is gitignored) — `chore(devnet): deploy, seed markets/offers, price pusher`

---

### Task 14: Keeper

**Files:**
- Create: `scripts/src/keeper.ts`
- Test: `scripts/test/keeper.test.ts`

**Interfaces:**
- Produces: `export function decide(p: { status: string; breachCount: number; confirmMarks: number; now: number; maturity: number }): ('settle'|'liquidate'|'mark')[]` and a loop that every 5 s fetches open positions and executes the decided cranks with the right accounts (ATAs for payouts), logging each tx signature; tolerates `MarketClosedOrStale`/`StalePublishTime` silently.

- [ ] **Step 1: Failing tests**: `matured → settle only`; `breach >= confirm → mark then liquidate`; `healthy → mark`; `closed → nothing`.
- [ ] **Step 2–4:** FAIL → implement → PASS. Run against devnet for 2 minutes; confirm marks land.
- [ ] **Step 5: Commit** — `feat(ops): keeper cranks mark/liquidate/settle`

---

### Task 15: README, pitch and submission package

**Files:**
- Create/modify: `README.md`, `docs/pitch-script.md`, `docs/demo-storyboard.md`, `docs/submission.md`

- [ ] **Step 1: README** — sections: one-line pitch; status/legal banner (Global Constraints text); problem (Turkish lira volatility, three personas); how it works (rate-parity formula, offers, margin, waterfall); 15 markets table; Hedge Advisor maths; architecture diagram (mermaid); devnet addresses (program, mints, offers count) and devnet activity metrics (positions opened, volume) from a script; business model; competition (BIST VIOP, Ostium, Synthetix); security notes (checks listed in spec §5); run locally; tests (`cargo test -p parity`, `pnpm -r test`); prior-work disclosure; team; MIT license; credits (Pyth, thinking-orbs, p5.brush).
- [ ] **Step 2: Pitch script** (≤3:00, English, timed sections): hook (lira 2018/2021 moves) → personas → product → why Solana (fast cheap marks, USDG/USDC, composability) → business model → competition → roadmap (legal review, audit, mainnet with licensed partner) → team.
- [ ] **Step 3: Demo storyboard** (≤3:00) per spec §10, with exact clicks, admin shocks and expected on-screen numbers; note: record while FX markets are open.
- [ ] **Step 4: Submission texts** `docs/submission.md`: Colosseum fields (name, tagline, description, tracks: Solana), Superteam Türkiye listing answers, team bios, links placeholders filled with real URLs after Task 16.
- [ ] **Step 5: Humanizer pass** on README/pitch (`humanizer` skill). **Commit** — `docs: readme, pitch script, demo storyboard, submission texts`

---

### Task 16: Vercel deploy + end-to-end devnet smoke

- [ ] **Step 1:** Vercel project `parity-solana` from `app/`; env: `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_RPC_URL` (devnet), `NEXT_PUBLIC_USDC_MINT`, `NEXT_PUBLIC_USDG_MINT`, `FAUCET_SECRET_KEY` (devnet mint authority only). Deploy; confirm production URL loads.
- [ ] **Step 2: E2E smoke on the deployed URL** with a fresh wallet: faucet → Advisor (freelancer, $3,000/month, 3 months, balanced) → Lock it (3 positions) → Positions shows 3 Open → Admin: demo mode on, shock USD/TRY → keeper marks → Called → confirmations → partial liquidation → gap → full liquidation with waterfall numbers → separate position settled after clock +90d. Record tx signatures in `docs/devnet.md`.
- [ ] **Step 3:** Fix anything found (systematic-debugging skill), redeploy, update README links. **Commit** — `chore: vercel deploy and e2e smoke results`
