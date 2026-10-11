//! Pyth pull-oracle adapter: reads `PriceUpdateV2` accounts by raw layout (no SDK dependency)
//! and composes a market's spot and USD-per-quote from one or two feeds.
use anchor_lang::prelude::*;

use crate::{
    constants::{CONV_INV_FEED_B, OP_NONE},
    errors::ParityError,
    math,
    state::{Config, DemoState, Market, RiskParams},
};

/// Pyth Solana receiver program; owns every `PriceUpdateV2` account.
pub const PYTH_RECEIVER: Pubkey = pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
/// Anchor discriminator of `PriceUpdateV2` (sha256("account:PriceUpdateV2")[..8]).
pub const PRICE_UPDATE_V2_DISCRIMINATOR: [u8; 8] = [0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd];
/// Minimum data length of a `PriceUpdateV2` with `VerificationLevel::Full` (through posted_slot).
pub const PRICE_UPDATE_V2_MIN_LEN: usize = 133;
/// Tolerated clock skew for a publish_time ahead of `now`.
pub const MAX_FUTURE_SKEW_SECS: i64 = 5;

// PriceUpdateV2 layout (Full verification): [0..8] disc, [8..40] write_authority,
// [40] verification tag (1 = Full; 0 = Partial followed by a u8), [41..73] feed_id,
// [73..81] price i64, [81..89] conf u64, [89..93] expo i32, [93..101] publish_time i64.
const VERIFICATION_FULL: u8 = 1;

/// A market price read: legs `a`/`b` and `spot`/`upq` at 1e8 scale.
/// Emitted (with `market_id`) as the `crate::instructions::oracle_view::PriceRead` event.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PriceRead {
    pub a: u64,
    pub b: u64,
    pub spot: u64,
    pub upq: u64,
    pub publish_time: i64,
}

/// Parse a Pyth `PriceUpdateV2` account (owner, discriminator, Full verification).
/// Returns `(feed_id, price, conf, expo, publish_time)`.
pub fn parse_price_update(acc: &AccountInfo) -> Result<([u8; 32], i64, u64, i32, i64)> {
    require_keys_eq!(*acc.owner, PYTH_RECEIVER, ParityError::NotPythAccount);
    let data = acc.try_borrow_data()?;
    parse_price_update_data(&data)
}

/// Layout checks on raw account data (owner already verified).
pub fn parse_price_update_data(data: &[u8]) -> Result<([u8; 32], i64, u64, i32, i64)> {
    require!(data.len() >= PRICE_UPDATE_V2_MIN_LEN, ParityError::NotPythAccount);
    require!(data[0..8] == PRICE_UPDATE_V2_DISCRIMINATOR, ParityError::NotPythAccount);
    require!(data[40] == VERIFICATION_FULL, ParityError::WrongFeed);
    let feed_id: [u8; 32] = data[41..73].try_into().unwrap();
    let price = i64::from_le_bytes(data[73..81].try_into().unwrap());
    let conf = u64::from_le_bytes(data[81..89].try_into().unwrap());
    let expo = i32::from_le_bytes(data[89..93].try_into().unwrap());
    let publish_time = i64::from_le_bytes(data[93..101].try_into().unwrap());
    Ok((feed_id, price, conf, expo, publish_time))
}

/// Validate one parsed feed against the expected id and risk params; return the 1e8 price.
pub fn validate_feed(
    parsed: ([u8; 32], i64, u64, i32, i64),
    expected_feed: &[u8; 32],
    params: &RiskParams,
    now: i64,
) -> Result<(u64, i64)> {
    let (feed_id, price, conf, expo, publish_time) = parsed;
    require!(feed_id == *expected_feed, ParityError::WrongFeed);
    let age = now.checked_sub(publish_time).ok_or_else(|| error!(ParityError::MarketClosedOrStale))?;
    require!(age <= params.max_price_age_secs, ParityError::MarketClosedOrStale);
    require!(age >= -MAX_FUTURE_SKEW_SECS, ParityError::MarketClosedOrStale);
    require!(price > 0, ParityError::OracleConfidence);
    // conf / price <= max_conf_bps / 1e4
    let lhs = conf as i128 * 10_000;
    let rhs = price as i128 * params.max_conf_bps as i128;
    require!(lhs <= rhs, ParityError::OracleConfidence);
    let p = math::normalize_pyth(price, expo).ok_or_else(|| error!(ParityError::MathOverflow))?;
    Ok((p, publish_time))
}

fn read_feed(acc: &AccountInfo, expected_feed: &[u8; 32], params: &RiskParams, now: i64) -> Result<(u64, i64)> {
    validate_feed(parse_price_update(acc)?, expected_feed, params, now)
}

/// Whether the market needs feed B (cross/scaled composition or quote leg from feed B).
pub fn needs_feed_b(market: &Market) -> bool {
    market.op != OP_NONE || market.quote_conv == CONV_INV_FEED_B
}

/// Read a market's price. Demo override (demo mode on and slot set) supersedes Pyth entirely,
/// with `publish_time = now`. Otherwise reads feed A (and feed B when needed; single-feed
/// callers pass `price_a` again as `price_b`, which is then ignored).
pub fn read_market_price(
    config: &Config,
    market: &Market,
    demo: &DemoState,
    price_a: &AccountInfo,
    price_b: &AccountInfo,
    now: i64,
) -> Result<PriceRead> {
    let overflow = || error!(ParityError::MathOverflow);
    let slot = demo.prices.get(market.id as usize).ok_or_else(|| error!(ParityError::InvalidMarket))?;
    let (a, b, publish_time) = if config.demo_mode && slot.set {
        (slot.a, slot.b, now)
    } else {
        let params = &config.params;
        let (a, pt_a) = read_feed(price_a, &market.feed_a, params, now)?;
        if needs_feed_b(market) {
            let (b, pt_b) = read_feed(price_b, &market.feed_b, params, now)?;
            (a, b, pt_a.min(pt_b))
        } else {
            (a, 0, pt_a)
        }
    };
    let spot = math::compose_spot(a, b, market.op, market.scale_num, market.scale_den).ok_or_else(overflow)?;
    let upq = math::usd_per_quote(a, b, market.quote_conv).ok_or_else(overflow)?;
    Ok(PriceRead { a, b, spot, upq, publish_time })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params() -> RiskParams {
        RiskParams {
            open_fee_bps: 10,
            maker_fee_share_bps: 1000,
            liq_penalty_bps: 100,
            liquidator_reward_bps: 2000,
            partial_liq_bps: 3000,
            call_equity_bps: 5000,
            liq_equity_bps: 2000,
            liq_confirm_marks: 3,
            liq_confirm_min_gap_secs: 30,
            max_price_age_secs: 60,
            max_conf_bps: 50,
            min_notional: 10_000_000,
        }
    }

    fn data(feed: [u8; 32], price: i64, conf: u64, expo: i32, pt: i64) -> Vec<u8> {
        let mut d = vec![0u8; 134];
        d[0..8].copy_from_slice(&PRICE_UPDATE_V2_DISCRIMINATOR);
        d[40] = 1;
        d[41..73].copy_from_slice(&feed);
        d[73..81].copy_from_slice(&price.to_le_bytes());
        d[81..89].copy_from_slice(&conf.to_le_bytes());
        d[89..93].copy_from_slice(&expo.to_le_bytes());
        d[93..101].copy_from_slice(&pt.to_le_bytes());
        d
    }

    /// Offset of the ParityError variant carried by `e` (variant `as u32`).
    fn code(e: anchor_lang::error::Error) -> u32 {
        match e {
            anchor_lang::error::Error::AnchorError(a) => a.error_code_number - anchor_lang::error::ERROR_CODE_OFFSET,
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn parses_full_layout() {
        let d = data([7; 32], 4_150_000, 12, -5, 1_000);
        assert_eq!(parse_price_update_data(&d).unwrap(), ([7; 32], 4_150_000, 12, -5, 1_000));
    }

    #[test]
    fn rejects_short_bad_disc_and_partial() {
        let d = data([7; 32], 1, 0, -5, 0);
        assert_eq!(code(parse_price_update_data(&d[..132]).unwrap_err()), ParityError::NotPythAccount as u32);
        let mut bad = d.clone();
        bad[3] ^= 1;
        assert_eq!(code(parse_price_update_data(&bad).unwrap_err()), ParityError::NotPythAccount as u32);
        let mut partial = d.clone();
        partial[40] = 0;
        assert_eq!(code(parse_price_update_data(&partial).unwrap_err()), ParityError::WrongFeed as u32);
    }

    #[test]
    fn validate_feed_rules() {
        let p = params();
        let ok = ([7; 32], 4_150_000i64, 20_750u64, -5i32, 940i64);
        assert_eq!(validate_feed(ok, &[7; 32], &p, 1_000).unwrap(), (4_150_000_000, 940));
        assert_eq!(code(validate_feed(ok, &[8; 32], &p, 1_000).unwrap_err()), ParityError::WrongFeed as u32);
        assert_eq!(code(validate_feed(ok, &[7; 32], &p, 1_001).unwrap_err()), ParityError::MarketClosedOrStale as u32);
        assert!(validate_feed(ok, &[7; 32], &p, 935).is_ok()); // 5 s in the future tolerated
        assert_eq!(code(validate_feed(ok, &[7; 32], &p, 934).unwrap_err()), ParityError::MarketClosedOrStale as u32);
        let wide = ([7; 32], 4_150_000i64, 20_751u64, -5i32, 940i64);
        assert_eq!(code(validate_feed(wide, &[7; 32], &p, 1_000).unwrap_err()), ParityError::OracleConfidence as u32);
        let neg = ([7; 32], -1i64, 0u64, -5i32, 940i64);
        assert_eq!(code(validate_feed(neg, &[7; 32], &p, 1_000).unwrap_err()), ParityError::OracleConfidence as u32);
        let zero = ([7; 32], 0i64, 0u64, -5i32, 940i64);
        assert_eq!(code(validate_feed(zero, &[7; 32], &p, 1_000).unwrap_err()), ParityError::OracleConfidence as u32);
        // extreme publish_time does not panic on subtraction
        let ancient = ([7; 32], 1i64, 0u64, -5i32, i64::MIN);
        assert_eq!(code(validate_feed(ancient, &[7; 32], &p, 1_000).unwrap_err()), ParityError::MarketClosedOrStale as u32);
    }
}
