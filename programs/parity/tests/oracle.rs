//! Oracle adapter tests via the permissionless `debug_price(market_id)` view instruction.
mod common;
use anchor_lang::{AnchorDeserialize, Discriminator};
use base64::Engine;
use common::*;
use parity::state::MarketArgs;

/// Placeholder feed ids.
const USD_TRY_FEED: [u8; 32] = [1u8; 32];
const BTC_FEED: [u8; 32] = [9u8; 32];
const EUR_USD_FEED: [u8; 32] = [2u8; 32];

/// USD/TRY 41.50000 at expo -5 (Pyth FX convention).
const USD_TRY_PRICE: i64 = 4_150_000;
const USD_TRY_SPOT: u64 = 4_150_000_000; // 1e8 scale
/// EUR/USD 1.16000 at expo -5.
const EUR_USD_PRICE: i64 = 116_000;

fn new_addr() -> anchor_lang::prelude::Pubkey { Keypair::new().pubkey() }

/// initialize + USD/TRY market 0 (feed `[1;32]`).
fn setup_usd_try() -> Ctx {
    let mut c = setup();
    init_all(&mut c);
    upsert_market(&mut c, usd_try_market_args()).unwrap();
    c
}

/// Market 1: EUR/TRY = EUR/USD (feed A) x USD/TRY (feed B), quote leg via InvFeedB.
fn eur_try_args() -> MarketArgs {
    MarketArgs {
        id: 1,
        symbol: *b"EUR/TRY\0\0\0\0\0",
        base: *b"EUR",
        quote: *b"TRY",
        feed_a: EUR_USD_FEED,
        feed_b: USD_TRY_FEED,
        op: 1,
        scale_num: 1,
        scale_den: 1,
        quote_conv: 2,
        im_bps: 1000,
        active: true,
    }
}

fn debug_price(c: &mut Ctx, market_id: u16, price_a: anchor_lang::prelude::Pubkey, price_b: anchor_lang::prelude::Pubkey) -> TxResult {
    let i = ix(
        parity::accounts::DebugPrice {
            config: config_pda(),
            market: market_pda(market_id),
            demo_state: demo_pda(),
            price_a,
            price_b,
        },
        parity::instruction::DebugPrice { market_id },
    );
    let taker = c.taker.insecure_clone();
    send(c, &[i], &[&taker])
}

/// Decode the `PriceRead` event from the `Program data:` log line.
fn price_event(meta: &litesvm::types::TransactionMetadata) -> parity::PriceRead {
    let disc = parity::PriceRead::DISCRIMINATOR;
    for l in &meta.logs {
        if let Some(b64) = l.strip_prefix("Program data: ") {
            let bytes = base64::engine::general_purpose::STANDARD.decode(b64).unwrap();
            if bytes.starts_with(disc) {
                return parity::PriceRead::deserialize(&mut &bytes[disc.len()..]).unwrap();
            }
        }
    }
    panic!("no PriceRead event in logs:\n{}", meta.logs.join("\n"));
}

#[test]
fn reads_fresh_price() {
    let mut c = setup_usd_try();
    let pa = new_addr();
    let now = c.now();
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now - 10);
    let ev = price_event(&debug_price(&mut c, 0, pa, pa).unwrap());
    assert_eq!(ev.market_id, 0);
    assert_eq!(ev.a, USD_TRY_SPOT);
    assert_eq!(ev.spot, USD_TRY_SPOT);
    assert_eq!(ev.upq, 10_000_000_000_000_000 / USD_TRY_SPOT); // 1 TRY in USD at 1e8 scale
    assert_eq!(ev.publish_time, now - 10);
}

#[test]
fn stale_price_rejected() {
    let mut c = setup_usd_try();
    let pa = new_addr();
    let now = c.now();
    // exactly at the limit passes
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now - 60);
    debug_price(&mut c, 0, pa, pa).unwrap();
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now - 61);
    assert_error(debug_price(&mut c, 0, pa, pa).unwrap_err(), "MarketClosedOrStale");
}

#[test]
fn future_publish_time_rejected() {
    let mut c = setup_usd_try();
    let pa = new_addr();
    let now = c.now();
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now + 5);
    debug_price(&mut c, 0, pa, pa).unwrap();
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now + 6);
    assert_error(debug_price(&mut c, 0, pa, pa).unwrap_err(), "MarketClosedOrStale");
}

#[test]
fn wrong_feed_rejected() {
    let mut c = setup_usd_try();
    let pa = new_addr();
    let now = c.now();
    write_price_update(&mut c, pa, BTC_FEED, 11_000_000_000_000, 1_000, -8, now);
    assert_error(debug_price(&mut c, 0, pa, pa).unwrap_err(), "WrongFeed");
}

#[test]
fn partial_verification_rejected() {
    let mut c = setup_usd_try();
    let pa = new_addr();
    let now = c.now();
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now);
    let mut acc = c.svm.get_account(&pa).unwrap();
    acc.data[40] = 0; // VerificationLevel::Partial tag
    c.svm.set_account(pa, acc).unwrap();
    assert_error(debug_price(&mut c, 0, pa, pa).unwrap_err(), "WrongFeed");
}

#[test]
fn fake_owner_rejected() {
    let mut c = setup_usd_try();
    let pa = new_addr();
    let now = c.now();
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now);
    let mut acc = c.svm.get_account(&pa).unwrap();
    acc.owner = SYSTEM_PROGRAM;
    c.svm.set_account(pa, acc).unwrap();
    assert_error(debug_price(&mut c, 0, pa, pa).unwrap_err(), "NotPythAccount");
}

#[test]
fn bad_discriminator_rejected() {
    let mut c = setup_usd_try();
    let pa = new_addr();
    let now = c.now();
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now);
    let mut acc = c.svm.get_account(&pa).unwrap();
    acc.data[0] ^= 0xff;
    c.svm.set_account(pa, acc).unwrap();
    assert_error(debug_price(&mut c, 0, pa, pa).unwrap_err(), "NotPythAccount");
}

#[test]
fn wide_confidence_rejected() {
    let mut c = setup_usd_try();
    let pa = new_addr();
    let now = c.now();
    // max_conf_bps = 50: conf limit = price * 50 / 10_000 = 20_750 at expo -5
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 20_750, -5, now);
    debug_price(&mut c, 0, pa, pa).unwrap();
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 20_751, -5, now);
    assert_error(debug_price(&mut c, 0, pa, pa).unwrap_err(), "OracleConfidence");
}

#[test]
fn demo_override_used_when_on() {
    let mut c = setup_usd_try();
    set_demo_mode(&mut c, true).unwrap();
    set_demo_price(&mut c, 0, 5_000_000_000, 0, true).unwrap();
    set_demo_clock(&mut c, 7 * 86_400).unwrap(); // shifted clock must not make the override stale
    // An unrelated, non-Pyth account: override means accounts are not read at all.
    let junk = new_addr();
    let ev = price_event(&debug_price(&mut c, 0, junk, junk).unwrap());
    assert_eq!(ev.a, 5_000_000_000);
    assert_eq!(ev.spot, 5_000_000_000);
    assert_eq!(ev.upq, 10_000_000_000_000_000 / 5_000_000_000);
    assert_eq!(ev.publish_time, c.now() + 7 * 86_400);
}

#[test]
fn override_ignored_when_demo_off() {
    let mut c = setup_usd_try();
    set_demo_mode(&mut c, true).unwrap();
    set_demo_price(&mut c, 0, 5_000_000_000, 0, true).unwrap();
    set_demo_mode(&mut c, false).unwrap();
    let pa = new_addr();
    let now = c.now();
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now);
    let ev = price_event(&debug_price(&mut c, 0, pa, pa).unwrap());
    assert_eq!(ev.spot, USD_TRY_SPOT);
    assert_eq!(ev.publish_time, now);
}

#[test]
fn demo_mode_without_override_reads_pyth() {
    let mut c = setup_usd_try();
    set_demo_mode(&mut c, true).unwrap();
    let pa = new_addr();
    let now = c.now();
    write_price_update(&mut c, pa, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now);
    let ev = price_event(&debug_price(&mut c, 0, pa, pa).unwrap());
    assert_eq!(ev.spot, USD_TRY_SPOT);
}

#[test]
fn cross_reads_both_feeds() {
    let mut c = setup_usd_try();
    upsert_market(&mut c, eur_try_args()).unwrap();
    let (pa, pb) = (new_addr(), new_addr());
    let now = c.now();
    write_price_update(&mut c, pa, EUR_USD_FEED, EUR_USD_PRICE, 10, -5, now - 3);
    write_price_update(&mut c, pb, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now - 7);
    let ev = price_event(&debug_price(&mut c, 1, pa, pb).unwrap());
    assert_eq!(ev.a, 116_000_000);
    assert_eq!(ev.b, USD_TRY_SPOT);
    assert_eq!(ev.spot, 116_000_000u64 * USD_TRY_SPOT / 100_000_000); // 48.14 TRY per EUR
    assert_eq!(ev.upq, 10_000_000_000_000_000 / USD_TRY_SPOT);
    assert_eq!(ev.publish_time, now - 7); // min of both
}

#[test]
fn cross_requires_both_feeds() {
    let mut c = setup_usd_try();
    upsert_market(&mut c, eur_try_args()).unwrap();
    let pa = new_addr();
    let now = c.now();
    write_price_update(&mut c, pa, EUR_USD_FEED, EUR_USD_PRICE, 10, -5, now);
    // feed B missing: caller passes feed A again
    assert_error(debug_price(&mut c, 1, pa, pa).unwrap_err(), "WrongFeed");
    // feed B missing: caller passes an empty account
    let empty = new_addr();
    assert_error(debug_price(&mut c, 1, pa, empty).unwrap_err(), "NotPythAccount");
    // feed B stale
    let pb = new_addr();
    write_price_update(&mut c, pb, USD_TRY_FEED, USD_TRY_PRICE, 1_000, -5, now - 61);
    assert_error(debug_price(&mut c, 1, pa, pb).unwrap_err(), "MarketClosedOrStale");
}
