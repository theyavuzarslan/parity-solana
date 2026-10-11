//! `take_offer` tests: opening margined forward positions against maker offers, fee routing,
//! carried-margin accounting, and atomicity of multi-rung (ladder) transactions.
mod common;
use anchor_lang::prelude::Pubkey;
use common::*;
use parity::{
    math::{bps_of_ceil, forward, quantity, strike, SECS_PER_DAY},
    state::{MakerOffer, MarketArgs, Position, Side, Status},
    PositionOpened,
};

const USD_TRY_FEED: [u8; 32] = [1u8; 32];
const XAU_USD_FEED: [u8; 32] = [3u8; 32];
/// USD/TRY 41.50000 at expo -5.
const USD_TRY_PRICE: i64 = 4_150_000;
const USD_TRY_SPOT: u64 = 4_150_000_000;
/// XAU/USD 4000.00000 at expo -5.
const XAU_USD_PRICE: i64 = 400_000_000;

const USD_RATE_BPS: i64 = 450;
const TRY_RATE_BPS: i64 = 4000;

const N_10K: u64 = 10_000 * ONE;

struct T {
    c: Ctx,
    offer: Pubkey,
    pa: Pubkey,
}

fn write_usd_try(c: &mut Ctx, addr: Pubkey, age: i64) {
    let now = c.now();
    write_price_update(c, addr, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now - age);
}

/// USD/TRY market 0, USD + TRY rates, default offer (maker Short, cap $100k, spread 20 bps) in
/// USDC, fresh USD/TRY price account.
fn setup_take() -> T {
    let mut c = setup_market();
    set_rate(&mut c, *b"USD", USD_RATE_BPS, 360).unwrap();
    set_rate(&mut c, *b"TRY", TRY_RATE_BPS, 365).unwrap();
    let usdc = c.usdc;
    create_offer(&mut c, usdc, default_offer()).unwrap();
    let offer = offer_pda(c.maker.pubkey(), 1);
    let pa = Keypair::new().pubkey();
    write_usd_try(&mut c, pa, 5);
    T { c, offer, pa }
}

fn usd_try_upq() -> u64 { (10_000_000_000_000_000u128 / USD_TRY_SPOT as u128) as u64 }

fn expected_usd_try(tenor_days: u16, spread_bps: u16, taker_long: bool, notional: u64) -> (u64, u64) {
    let t = tenor_days as i64 * SECS_PER_DAY;
    let f = forward(USD_TRY_SPOT, USD_RATE_BPS, 360, TRY_RATE_BPS, 365, t).unwrap();
    let k = strike(f, spread_bps, taker_long).unwrap();
    let q = quantity(notional, USD_TRY_SPOT, usd_try_upq()).unwrap();
    (k, q)
}

#[test]
fn open_usd_try_position() {
    let T { mut c, offer, pa } = setup_take();
    let usdc = c.usdc;
    let (maker, taker) = (c.maker.pubkey(), c.taker.pubkey());
    let taker_ata = c.ata_of(taker, usdc);
    let vault0 = c.balance(vault_pda(usdc));
    let now = c.now();

    let meta = take_offer(&mut c, offer, pa, pa, N_10K, 30).unwrap();

    let im = 1_000 * ONE; // 10% of $10k
    let maker_fee = 2 * ONE; // 10% of 20 bps of $10k
    let open_fee = 10 * ONE; // 10 bps of $10k
    assert_eq!(c.balance(taker_ata), INITIAL_BALANCE - im - open_fee);
    assert_eq!(c.balance(vault_pda(usdc)), vault0 + im - maker_fee);
    assert_eq!(c.balance(insurance_pda(usdc)), open_fee + maker_fee);

    let o: MakerOffer = c.fetch(offer);
    assert_eq!(o.capacity_usd, CAP_100K - N_10K);
    assert_eq!(o.margin_locked, vault0 - im - maker_fee);
    assert_eq!(o.position_counter, 1);
    assert!(o.active);

    let (k, q) = expected_usd_try(30, 20, true, N_10K);
    let pos_addr = position_pda(offer, 0);
    let p: Position = c.fetch(pos_addr);
    assert_eq!(p.offer, offer);
    assert_eq!(p.index, 0);
    assert_eq!(p.long, taker);
    assert_eq!(p.short, maker);
    assert_eq!(p.market_id, 0);
    assert_eq!(p.mint, usdc);
    assert_eq!(p.notional_usd, N_10K);
    assert_eq!(p.qty, q);
    assert_eq!(p.strike, k);
    assert_eq!(p.opened_at, now);
    assert_eq!(p.maturity, now + 30 * SECS_PER_DAY);
    assert_eq!((p.im_per_side, p.margin_long, p.margin_short), (im, im, im));
    assert_eq!(p.status, Status::Open);
    assert_eq!(p.breach_count, 0);
    assert_eq!(p.last_publish_time, now - 5);
    // $10k at 41.5 TRY/USD = 10_000 USD notional (base is USD).
    assert_eq!(q, 10_000_002_300); // USD base: ~10_000 units; upq floor makes usd_per_base slightly < 1
    // strike = forward + 20 bps (ceil), forward above spot (TRY rate > USD rate)
    let f = forward(USD_TRY_SPOT, USD_RATE_BPS, 360, TRY_RATE_BPS, 365, 30 * SECS_PER_DAY).unwrap();
    assert!(f > USD_TRY_SPOT && k > f);

    let e: PositionOpened = event(&meta);
    assert_eq!(e.position, pos_addr);
    assert_eq!(e.market_id, 0);
    assert_eq!((e.long, e.short), (taker, maker));
    assert_eq!((e.notional_usd, e.qty, e.strike), (N_10K, q, k));
    assert_eq!(e.maturity, now + 30 * SECS_PER_DAY);
    assert_eq!(e.mint, usdc);
}

#[test]
fn strike_side_convention() {
    let T { mut c, offer, pa } = setup_take();
    let usdc = c.usdc;
    let (maker, taker) = (c.maker.pubkey(), c.taker.pubkey());
    // maker Short -> taker long -> strike rounded up above forward
    take_offer(&mut c, offer, pa, pa, N_10K, 30).unwrap();
    let p: Position = c.fetch(position_pda(offer, 0));
    let (k_long, _) = expected_usd_try(30, 20, true, N_10K);
    assert_eq!((p.long, p.short, p.strike), (taker, maker, k_long));

    // maker Long -> taker short -> strike rounded down below forward
    let o2 = OfferArgs { nonce: 2, side: Side::Long, ..default_offer() };
    create_offer(&mut c, usdc, o2).unwrap();
    let offer2 = offer_pda(maker, 2);
    take_offer(&mut c, offer2, pa, pa, N_10K, 30).unwrap();
    let p2: Position = c.fetch(position_pda(offer2, 0));
    let (k_short, _) = expected_usd_try(30, 20, false, N_10K);
    assert_eq!((p2.long, p2.short, p2.strike), (maker, taker, k_short));

    let f = forward(USD_TRY_SPOT, USD_RATE_BPS, 360, TRY_RATE_BPS, 365, 30 * SECS_PER_DAY).unwrap();
    assert!(k_short < f && f < k_long);
    // ceil vs floor: long strike is the exact ceil, short the exact floor
    assert_eq!(k_long, ((f as u128 * 10_020 + 9_999) / 10_000) as u64);
    assert_eq!(k_short, (f as u128 * 9_980 / 10_000) as u64);
}

#[test]
fn tenor_out_of_range_rejected() {
    let T { mut c, offer, pa } = setup_take();
    assert_error(take_offer(&mut c, offer, pa, pa, N_10K, 6).unwrap_err(), "InvalidTenor");
    assert_error(take_offer(&mut c, offer, pa, pa, N_10K, 91).unwrap_err(), "InvalidTenor");
    take_offer(&mut c, offer, pa, pa, N_10K, 7).unwrap();
    take_offer(&mut c, offer, pa, pa, N_10K, 90).unwrap();
}

#[test]
fn below_min_notional_rejected() {
    let T { mut c, offer, pa } = setup_take();
    assert_error(take_offer(&mut c, offer, pa, pa, 10 * ONE - 1, 30).unwrap_err(), "BelowMinNotional");
    take_offer(&mut c, offer, pa, pa, 10 * ONE, 30).unwrap();
}

#[test]
fn exceeding_capacity_rejected() {
    let T { mut c, offer, pa } = setup_take();
    assert_error(take_offer(&mut c, offer, pa, pa, CAP_100K + 1, 30).unwrap_err(), "InsufficientCapacity");
    take_offer(&mut c, offer, pa, pa, CAP_100K, 30).unwrap();
    let o: MakerOffer = c.fetch(offer);
    assert_eq!(o.capacity_usd, 0);
    assert_eq!(o.margin_locked, 0); // round numbers: per-take margin equals the locked margin
    assert_error(take_offer(&mut c, offer, pa, pa, 10 * ONE, 30).unwrap_err(), "InsufficientCapacity");
}

#[test]
fn stale_price_rejected() {
    let T { mut c, offer, pa } = setup_take();
    write_usd_try(&mut c, pa, 61);
    assert_error(take_offer(&mut c, offer, pa, pa, N_10K, 30).unwrap_err(), "MarketClosedOrStale");
    write_usd_try(&mut c, pa, 60);
    take_offer(&mut c, offer, pa, pa, N_10K, 30).unwrap();
}

#[test]
fn taker_cannot_take_own_offer() {
    let T { mut c, offer, pa } = setup_take();
    let maker = c.maker.insecure_clone();
    let i = take_offer_ix(&c, maker.pubkey(), offer, 0, pa, pa, N_10K, 30);
    assert_error(send(&mut c, &[i], &[&maker]).unwrap_err(), "Unauthorized");
}

#[test]
fn cancelled_offer_rejected() {
    let T { mut c, offer, pa } = setup_take();
    let usdc = c.usdc;
    cancel_offer(&mut c, offer, usdc).unwrap();
    assert_error(take_offer(&mut c, offer, pa, pa, N_10K, 30).unwrap_err(), "OfferInactive");
}

#[test]
fn inactive_market_rejected() {
    let T { mut c, offer, pa } = setup_take();
    upsert_market(&mut c, MarketArgs { active: false, ..usd_try_market_args() }).unwrap();
    assert_error(take_offer(&mut c, offer, pa, pa, N_10K, 30).unwrap_err(), "MarketInactive");
}

#[test]
fn wrong_market_mint_or_rate_rejected() {
    let T { mut c, offer, pa } = setup_take();
    let taker = c.taker.insecure_clone();
    // Another (valid) market account
    upsert_market(&mut c, MarketArgs { id: 1, ..usd_try_market_args() }).unwrap();
    let mut i = take_offer_ix(&c, taker.pubkey(), offer, 0, pa, pa, N_10K, 30);
    i.accounts[3].pubkey = market_pda(1);
    assert_error(send(&mut c, &[i], &[&taker]).unwrap_err(), "InvalidMarket");

    // Mint swapped to USDG (with matching vault/insurance/ata)
    let usdg = c.usdg;
    let mut i = take_offer_ix(&c, taker.pubkey(), offer, 0, pa, pa, N_10K, 30);
    i.accounts[10].pubkey = usdg;
    i.accounts[11].pubkey = c.ata_of(taker.pubkey(), usdg);
    i.accounts[12].pubkey = vault_pda(usdg);
    i.accounts[13].pubkey = insurance_pda(usdg);
    i.accounts[14].pubkey = TOKEN_2022_PROGRAM;
    assert_error(send(&mut c, &[i], &[&taker]).unwrap_err(), "InvalidMint");

    // Base and quote rate accounts swapped
    let mut i = take_offer_ix(&c, taker.pubkey(), offer, 0, pa, pa, N_10K, 30);
    i.accounts.swap(5, 6);
    assert_error(send(&mut c, &[i], &[&taker]).unwrap_err(), "ConstraintSeeds");

    // Position PDA at the wrong counter
    let i = take_offer_ix(&c, taker.pubkey(), offer, 1, pa, pa, N_10K, 30);
    assert_error(send(&mut c, &[i], &[&taker]).unwrap_err(), "ConstraintSeeds");
}

#[test]
fn cancel_after_take_refunds_only_unencumbered() {
    let T { mut c, offer, pa } = setup_take();
    let usdc = c.usdc;
    let (maker, taker) = (c.maker.pubkey(), c.taker.pubkey());
    let (maker_ata, taker_ata) = (c.ata_of(maker, usdc), c.ata_of(taker, usdc));
    take_offer(&mut c, offer, pa, pa, N_10K, 30).unwrap();
    let o: MakerOffer = c.fetch(offer);
    assert_eq!(o.margin_locked, 9_018 * ONE);

    let meta = cancel_offer(&mut c, offer, usdc).unwrap();
    let e: parity::OfferCancelled = event(&meta);
    assert_eq!(e.refunded, 9_018 * ONE);
    // maker: -10_020 locked, +9_018 refunded => -1_002 (IM 1_000 + fee 2)
    assert_eq!(c.balance(maker_ata), INITIAL_BALANCE - 1_002 * ONE);
    assert_eq!(c.balance(taker_ata), INITIAL_BALANCE - 1_010 * ONE);
    // vault holds exactly both sides' IM; insurance holds open fee + maker fee
    assert_eq!(c.balance(vault_pda(usdc)), 2_000 * ONE);
    assert_eq!(c.balance(insurance_pda(usdc)), 12 * ONE);
    let p: Position = c.fetch(position_pda(offer, 0));
    assert_eq!(p.margin_long + p.margin_short, c.balance(vault_pda(usdc)));
}

#[test]
fn ladder_three_rungs_succeeds() {
    let T { mut c, offer, pa } = setup_take();
    let usdc = c.usdc;
    let taker = c.taker.insecure_clone();
    let rungs: [(u64, u16); 3] = [(30_000 * ONE, 7), (30_000 * ONE, 30), (30_000 * ONE, 90)];
    let ixs: Vec<_> = rungs
        .iter()
        .enumerate()
        .map(|(n, (notional, tenor))| take_offer_ix(&c, taker.pubkey(), offer, n as u64, pa, pa, *notional, *tenor))
        .collect();
    let meta = send(&mut c, &ixs, &[&taker]).unwrap();
    println!("3-rung ladder compute units: {}", meta.compute_units_consumed);

    let o: MakerOffer = c.fetch(offer);
    assert_eq!(o.position_counter, 3);
    assert_eq!(o.capacity_usd, 10_000 * ONE);
    assert_eq!(o.margin_locked, 10_020 * ONE - 3 * 3_006 * ONE);
    let now = c.now();
    for (n, (notional, tenor)) in rungs.iter().enumerate() {
        let p: Position = c.fetch(position_pda(offer, n as u64));
        assert_eq!(p.index, n as u64);
        assert_eq!(p.notional_usd, *notional);
        assert_eq!(p.maturity, now + *tenor as i64 * SECS_PER_DAY);
        assert_eq!(p.strike, expected_usd_try(*tenor, 20, true, *notional).0);
    }
    assert_eq!(c.balance(insurance_pda(usdc)), 3 * (30 + 6) * ONE);
}

#[test]
fn ladder_atomic_rollback() {
    let T { mut c, offer, pa } = setup_take();
    let usdc = c.usdc;
    let taker = c.taker.insecure_clone();
    let taker_ata = c.ata_of(taker.pubkey(), usdc);
    let before = (c.balance(taker_ata), c.balance(vault_pda(usdc)), c.balance(insurance_pda(usdc)));
    let o_before: MakerOffer = c.fetch(offer);

    let ixs: Vec<_> = (0..3u64)
        .map(|n| take_offer_ix(&c, taker.pubkey(), offer, n, pa, pa, 40_000 * ONE, 30))
        .collect();
    let err = send(&mut c, &ixs, &[&taker]).unwrap_err();
    assert_error(err, "InsufficientCapacity");

    for n in 0..3 {
        assert!(c.svm.get_account(&position_pda(offer, n)).is_none_or(|a| a.data.is_empty()));
    }
    assert_eq!(before, (c.balance(taker_ata), c.balance(vault_pda(usdc)), c.balance(insurance_pda(usdc))));
    let o: MakerOffer = c.fetch(offer);
    assert_eq!(
        (o.position_counter, o.capacity_usd, o.margin_locked),
        (o_before.position_counter, o_before.capacity_usd, o_before.margin_locked)
    );
}

/// GAU/TRY (gram gold in lira) = XAU/USD (feed A) x USD/TRY (feed B) / 31.1034768 g per troy oz,
/// quote leg via InvFeedB.
fn gau_try_args() -> MarketArgs {
    MarketArgs {
        id: 2,
        symbol: *b"GAU/TRY\0\0\0\0\0",
        base: *b"GAU",
        quote: *b"TRY",
        feed_a: XAU_USD_FEED,
        feed_b: USD_TRY_FEED,
        op: 1,
        scale_num: 100_000_000,
        scale_den: 3_110_347_680,
        quote_conv: 2,
        im_bps: 1500,
        active: true,
    }
}

#[test]
fn gram_gold_market_opens() {
    let T { mut c, pa, .. } = setup_take();
    let usdc = c.usdc;
    let (maker, taker) = (c.maker.pubkey(), c.taker.pubkey());
    upsert_market(&mut c, gau_try_args()).unwrap();
    set_rate(&mut c, *b"GAU", 0, 365).unwrap();
    let og = OfferArgs { nonce: 7, market_id: 2, ..default_offer() };
    create_offer(&mut c, usdc, og).unwrap();
    let offer = offer_pda(maker, 7);
    let pxau = Keypair::new().pubkey();
    let now = c.now();
    write_price_update(&mut c, pxau, XAU_USD_FEED, XAU_USD_PRICE, 100_000, -5, now - 3);

    take_offer(&mut c, offer, pxau, pa, N_10K, 30).unwrap();

    let p: Position = c.fetch(position_pda(offer, 0));
    let spot = 4_000_00000000u128 * 41_50000000 / 100_000_000 * 100_000_000 / 3_110_347_680;
    assert!((533_600_000_000..533_800_000_000).contains(&spot), "spot {spot}");
    let upq = usd_try_upq();
    let f = forward(spot as u64, 0, 365, TRY_RATE_BPS, 365, 30 * SECS_PER_DAY).unwrap();
    assert_eq!(p.strike, strike(f, 20, true).unwrap());
    let q = quantity(N_10K, spot as u64, upq).unwrap();
    assert_eq!(p.qty, q);
    // $10k of gold at ~$128.6/g ≈ 77.75 g (6dp)
    assert!((77_700_000..77_800_000).contains(&q), "qty {q}");
    assert_eq!(p.im_per_side, bps_of_ceil(N_10K, 1500));
    assert_eq!(p.long, taker);
    assert_eq!(p.last_publish_time, now - 5); // min of the two feeds' publish times
}
