//! Account types and shared state helpers.
use anchor_lang::prelude::*;

use crate::errors::ParityError;

/// Maximum number of markets (market ids are `0..MAX_MARKETS`; also the DemoState slot count).
pub const MAX_MARKETS: u16 = 16;
/// Minimum initial margin per side (10%).
pub const MIN_IM_BPS: u16 = 1000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub struct RiskParams {
    pub open_fee_bps: u16,             // 10
    pub maker_fee_share_bps: u16,      // 1000 (10% of spread)
    pub liq_penalty_bps: u16,          // 100
    pub liquidator_reward_bps: u16,    // 2000 (of penalty)
    pub partial_liq_bps: u16,          // 3000
    pub call_equity_bps: u16,          // 5000
    pub liq_equity_bps: u16,           // 2000
    pub liq_confirm_marks: u8,         // 3
    pub liq_confirm_min_gap_secs: i64, // 30 (demo: 2)
    pub max_price_age_secs: i64,       // 60
    pub max_conf_bps: u16,             // 50
    pub min_notional: u64,             // 10_000_000 ($10)
}

impl RiskParams {
    /// All bps <= 10_000, liq_equity < call_equity, max_price_age > 0, liq_confirm_marks >= 1,
    /// liq_confirm_min_gap_secs >= 0, partial_liq_bps > 0, min_notional > 0, max_conf_bps > 0.
    pub fn validate(&self) -> Result<()> {
        let bps = [
            self.open_fee_bps,
            self.maker_fee_share_bps,
            self.liq_penalty_bps,
            self.liquidator_reward_bps,
            self.partial_liq_bps,
            self.call_equity_bps,
            self.liq_equity_bps,
            self.max_conf_bps,
        ];
        require!(bps.iter().all(|b| *b <= 10_000), ParityError::InvalidParams);
        require!(self.liq_equity_bps < self.call_equity_bps, ParityError::InvalidParams);
        require!(self.max_price_age_secs > 0, ParityError::InvalidParams);
        require!(self.liq_confirm_marks >= 1, ParityError::InvalidParams);
        require!(self.liq_confirm_min_gap_secs >= 0, ParityError::InvalidParams);
        require!(self.partial_liq_bps > 0, ParityError::InvalidParams);
        require!(self.min_notional > 0, ParityError::InvalidParams);
        require!(self.max_conf_bps > 0, ParityError::InvalidParams);
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub usdg_mint: Pubkey,
    pub demo_mode: bool,
    pub demo_clock_offset: i64,
    pub params: RiskParams,
    pub bump: u8,
}

impl Config {
    pub fn is_allowed_mint(&self, mint: &Pubkey) -> bool {
        *mint == self.usdc_mint || *mint == self.usdg_mint
    }
}

/// Program "now": cluster clock plus the demo clock offset when demo mode is on.
pub fn effective_now(config: &Config) -> Result<i64> {
    let offset = if config.demo_mode { config.demo_clock_offset } else { 0 };
    Clock::get()?
        .unix_timestamp
        .checked_add(offset)
        .ok_or_else(|| error!(ParityError::MathOverflow))
}

/// A position's last accepted `publish_time`, or 0 when it lies in the future. A demo clock
/// offset that is later reduced can leave it ahead of `now`; treating it as 0 lets the position
/// be marked, liquidated or settled again instead of being stuck until real time catches up.
pub fn last_publish_floor(last_publish_time: i64, now: i64) -> i64 {
    if last_publish_time > now { 0 } else { last_publish_time }
}

#[account]
#[derive(InitSpace)]
pub struct Rate {
    pub code: [u8; 3],
    pub rate_bps: i64,
    pub basis_days: u16,
    pub updated_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub id: u16,
    pub symbol: [u8; 12],
    pub base: [u8; 3],
    pub quote: [u8; 3],
    pub feed_a: [u8; 32],
    pub feed_b: [u8; 32],
    pub op: u8,
    pub scale_num: u64,
    pub scale_den: u64,
    pub quote_conv: u8,
    pub im_bps: u16,
    pub active: bool,
    pub bump: u8,
}

/// Arguments for `upsert_market` (mirrors `Market` minus the bump).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct MarketArgs {
    pub id: u16,
    pub symbol: [u8; 12],
    pub base: [u8; 3],
    pub quote: [u8; 3],
    pub feed_a: [u8; 32],
    pub feed_b: [u8; 32],
    pub op: u8,
    pub scale_num: u64,
    pub scale_den: u64,
    pub quote_conv: u8,
    pub im_bps: u16,
    pub active: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default, PartialEq, Eq, Debug)]
pub struct DemoPrice {
    pub a: u64,
    pub b: u64,
    pub set: bool,
}

// DemoState has one slot per market id; keep the array length and MAX_MARKETS in sync.
const _: () = assert!(MAX_MARKETS == 16);

#[account]
#[derive(InitSpace)]
pub struct DemoState {
    pub prices: [DemoPrice; MAX_MARKETS as usize],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub enum Side {
    Long,
    Short,
}

#[account]
#[derive(InitSpace)]
pub struct MakerOffer {
    pub maker: Pubkey,
    pub nonce: u64,
    pub market_id: u16,
    pub mint: Pubkey,
    pub maker_side: Side,
    pub spread_bps: u16,
    pub min_tenor_days: u16,
    pub max_tenor_days: u16,
    pub capacity_usd: u64,
    pub margin_locked: u64,
    pub position_counter: u64,
    pub active: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub enum Status {
    Open,
    Called,
    PartiallyLiquidated,
    Settled,
    Liquidated,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub offer: Pubkey,
    pub index: u64,
    pub long: Pubkey,
    pub short: Pubkey,
    pub market_id: u16,
    pub mint: Pubkey,
    pub notional_usd: u64,
    pub qty: u64,
    pub strike: u64,
    pub opened_at: i64,
    pub maturity: i64,
    pub im_per_side: u64,
    pub margin_long: u64,
    pub margin_short: u64,
    pub status: Status,
    pub breach_count: u8,
    pub last_breach_time: i64,
    pub last_publish_time: i64,
    pub bump: u8,
}
