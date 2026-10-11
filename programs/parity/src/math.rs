//! Pure fixed-point pricing math (no Anchor types). Prices are scaled by 1e8.
pub const PRICE_SCALE: i128 = 100_000_000;
pub const BPS: i128 = 10_000;
pub const SECS_PER_DAY: i64 = 86_400;

pub fn normalize_pyth(price: i64, expo: i32) -> Option<u64> {
    if price <= 0 { return None; }
    let p = price as i128;
    let shift = expo.checked_add(8)?; // target expo -8
    let v = if shift >= 0 { p.checked_mul(10i128.checked_pow(shift as u32)?)? } else { p / 10i128.checked_pow((-shift) as u32)? };
    u64::try_from(v).ok().filter(|v| *v > 0)
}

/// op: 0=None 1=Mul 2=Div
pub fn compose_spot(a: u64, b: u64, op: u8, scale_num: u64, scale_den: u64) -> Option<u64> {
    let (a, b) = (a as i128, b as i128);
    let s = match op { 0 => a, 1 => a.checked_mul(b)? / PRICE_SCALE, 2 => { if b == 0 { return None } a.checked_mul(PRICE_SCALE)? / b }, _ => return None };
    if scale_den == 0 { return None; }
    let s = s.checked_mul(scale_num as i128)? / scale_den as i128;
    u64::try_from(s).ok().filter(|v| *v > 0)
}

/// conv: 0=Usd 1=InvFeedA 2=InvFeedB
/// Known limit: result is at 1e8 scale; for the largest supported quote-per-USD (~150, USD/JPY)
/// the rounding error is <= ~1.5 ppm. Never returns Some(0).
pub fn usd_per_quote(a: u64, b: u64, conv: u8) -> Option<u64> {
    let inv = |x: u64| -> Option<u64> { if x == 0 { None } else { u64::try_from(PRICE_SCALE * PRICE_SCALE / x as i128).ok().filter(|v| *v > 0) } };
    match conv { 0 => Some(PRICE_SCALE as u64), 1 => inv(a), 2 => inv(b), _ => None }
}

/// F = S × (B_q·1e4 + r_q·t) × B_b / (B_q × (B_b·1e4 + r_b·t)); B in seconds per year, r in bps, t in seconds (clamped ≥ 0).
pub fn forward(spot: u64, r_base_bps: i64, basis_base_days: u16, r_quote_bps: i64, basis_quote_days: u16, t_secs: i64) -> Option<u64> {
    let t = t_secs.max(0) as i128;
    let bb = basis_base_days as i128 * SECS_PER_DAY as i128;
    let bq = basis_quote_days as i128 * SECS_PER_DAY as i128;
    let num_q = bq.checked_mul(BPS)?.checked_add((r_quote_bps as i128).checked_mul(t)?)?;
    let den_b = bb.checked_mul(BPS)?.checked_add((r_base_bps as i128).checked_mul(t)?)?;
    if den_b <= 0 || num_q <= 0 || bq <= 0 || bb <= 0 { return None; }
    // Single rounding: S ≤ ~1e14 realistic, so S×num_q×B_b ≈ 1e14×3e11×3e7 ≈ 1e33 < i128::MAX; denominator B_q×den_b.
    let f = (spot as i128).checked_mul(num_q)?.checked_mul(bb)?.checked_div(bq.checked_mul(den_b)?)?;
    u64::try_from(f).ok().filter(|v| *v > 0)
}

pub fn strike(fwd: u64, spread_bps: u16, taker_long: bool) -> Option<u64> {
    let f = fwd as i128; let s = spread_bps as i128;
    // taker long pays more: round UP; taker short receives less: round down.
    let k = if taker_long { (f.checked_mul(BPS + s)?.checked_add(BPS - 1)?) / BPS } else { f.checked_mul(BPS - s)? / BPS };
    u64::try_from(k).ok()
}

/// Q (base units, 6dp) = N (USD, 6dp) / (S × upq)
pub fn quantity(notional_usd: u64, spot: u64, upq: u64) -> Option<u64> {
    let usd_per_base = (spot as i128).checked_mul(upq as i128)? / PRICE_SCALE;
    if usd_per_base == 0 { return None; }
    u64::try_from((notional_usd as i128).checked_mul(PRICE_SCALE)? / usd_per_base).ok()
}

/// Rounding: short = −long exactly (zero-sum); every division floors toward −∞ (div_euclid),
/// so error is ≤ 1 micro-unit per step, toward −∞ for the long.
/// Long PnL in USD collateral units: Q(F_t−K)·upq / (1 + r_q·τ/B_q). Short = −long.
pub fn pnl_long_usd(qty: u64, fwd_now: u64, strike: u64, upq: u64, r_quote_bps: i64, basis_quote_days: u16, tau_secs: i64) -> Option<i128> {
    let quote_units = (qty as i128).checked_mul(fwd_now as i128 - strike as i128)?.div_euclid(PRICE_SCALE);
    let usd = quote_units.checked_mul(upq as i128)?.div_euclid(PRICE_SCALE);
    let bq = basis_quote_days as i128 * SECS_PER_DAY as i128 * BPS;
    let den = bq.checked_add((r_quote_bps as i128).checked_mul(tau_secs.max(0) as i128)?)?;
    if den <= 0 { return None; }
    Some(usd.checked_mul(bq)?.div_euclid(den))
}

/// Saturates to u64::MAX (cannot occur for bps ≤ 10_000).
pub fn bps_of(amount: u64, bps: u16) -> u64 { u64::try_from((amount as u128 * bps as u128) / BPS as u128).unwrap_or(u64::MAX) }
pub fn bps_of_ceil(amount: u64, bps: u16) -> u64 { u64::try_from((amount as u128 * bps as u128 + (BPS as u128 - 1)) / BPS as u128).unwrap_or(u64::MAX) }

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

    #[test] fn strike_rounding_direction() {
        // 3 * 10001 / 10000 = 3.0003 -> long ceil 4, short 3*9999/10000 = 2.9997 -> floor 2
        assert_eq!(strike(3, 1, true), Some(4));
        assert_eq!(strike(3, 1, false), Some(2));
    }
    #[test] fn pnl_rounds_toward_neg_inf() {
        let q = 1_000_000u64; // 1 base unit
        let neg = pnl_long_usd(q, 100 * S - 1, 100 * S, S, 0, 365, 0).unwrap();
        let pos = pnl_long_usd(q, 100 * S + 1, 100 * S, S, 0, 365, 0).unwrap();
        assert_eq!(neg, -1);
        assert_eq!(pos, 0);
    }

    use proptest::prelude::*;
    proptest! {
        #[test] fn forward_never_panics(spot in 1_000u64..=100_000_000_000_000, rb in -500i64..=50_000, rq in -500i64..=50_000,
                                        t in 0i64..=365 * SECS_PER_DAY, bbd in prop::sample::select(vec![360u16, 365]), bqd in prop::sample::select(vec![360u16, 365])) {
            let f = forward(spot, rb, bbd, rq, bqd, t);
            if rb >= 0 && rq >= 0 { prop_assert!(f.is_some()); }
        }
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
