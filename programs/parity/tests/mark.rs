//! `mark` / `add_margin` tests: mark-to-market, margin calls, breach counting with fresh prices
//! and a minimum gap, healthy resets, and topping up margin.
mod common;
use anchor_lang::{prelude::Pubkey, AccountSerialize};
use common::*;
use parity::{
    math::{forward, pnl_long_usd},
    state::{Position, Side, Status},
    MarginAdded, Marked,
};

const USD_TRY_FEED: [u8; 32] = [1u8; 32];
const USD_RATE_BPS: i64 = 450;
const TRY_RATE_BPS: i64 = 4000;
const N_10K: u64 = 10_000 * ONE;
const IM: u64 = 1_000 * ONE;

/// USD/TRY prices at expo -5.
const P_42: i64 = 4_200_000;
const P_39_8: i64 = 3_980_000;
const P_38_5: i64 = 3_850_000;

struct T {
    c: Ctx,
    position: Pubkey,
    pa: Pubkey,
}

fn write_px(c: &mut Ctx, addr: Pubkey, price: i64) {
    let now = c.now();
    write_price_update(c, addr, USD_TRY_FEED, price, 1_000, -5, now);
}

/// USD/TRY at 42, IM 10%, maker Short (taker long) $10k for 30 days in USDC.
fn setup_position() -> T {
    let mut c = setup_market();
    set_rate(&mut c, *b"USD", USD_RATE_BPS, 360).unwrap();
    set_rate(&mut c, *b"TRY", TRY_RATE_BPS, 365).unwrap();
    let usdc = c.usdc;
    create_offer(&mut c, usdc, default_offer()).unwrap();
    let offer = offer_pda(c.maker.pubkey(), 1);
    let pa = Keypair::new().pubkey();
    write_px(&mut c, pa, P_42);
    take_offer(&mut c, offer, pa, pa, N_10K, 30).unwrap();
    T { c, position: position_pda(offer, 0), pa }
}

/// Advance 1s, publish a fresh price, mark (paid by a random keeper).
fn mark_fresh(t: &mut T, price: i64) -> TxResult {
    advance_time(&mut t.c, 1);
    write_px(&mut t.c, t.pa, price);
    mark_now(t)
}

fn mark_now(t: &mut T) -> TxResult {
    let keeper = Keypair::new();
    t.c.svm.airdrop(&keeper.pubkey(), 1_000_000_000).unwrap();
    mark_as(&mut t.c, &keeper, t.position, t.pa, t.pa)
}

/// Expected long PnL recomputed from the program's math at the current clock.
fn expected_pnl(c: &Ctx, p: &Position, price: i64) -> i128 {
    let spot = price as u64 * 1_000;
    let upq = (10_000_000_000_000_000u128 / spot as u128) as u64;
    let tau = (p.maturity - c.now()).max(0);
    let f = forward(spot, USD_RATE_BPS, 360, TRY_RATE_BPS, 365, tau).unwrap();
    pnl_long_usd(p.qty, f, p.strike, upq, TRY_RATE_BPS, 365, tau).unwrap()
}

fn set_status(c: &mut Ctx, position: Pubkey, status: Status) {
    let mut p: Position = c.fetch(position);
    p.status = status;
    let mut acc = c.svm.get_account(&position).unwrap();
    let mut data = Vec::new();
    p.try_serialize(&mut data).unwrap();
    acc.data[..data.len()].copy_from_slice(&data);
    c.svm.set_account(position, acc).unwrap();
}

#[test]
fn margin_call_fires() {
    let mut t = setup_position();
    let meta = mark_fresh(&mut t, P_39_8).unwrap();
    let p: Position = t.c.fetch(t.position);
    let pnl = expected_pnl(&t.c, &p, P_39_8);
    // Loss in the call band: 50%..80% of IM.
    assert!(pnl < -((IM / 2) as i128) && pnl > -((IM * 8 / 10) as i128), "pnl {pnl}");

    let ev: Marked = event(&meta);
    assert_eq!(ev.position, t.position);
    assert_eq!(ev.pnl_long, pnl);
    assert_eq!(ev.loser_equity, IM as i128 + pnl);
    assert_eq!(ev.status, Status::Called);
    assert_eq!(ev.breach_count, 0);

    assert_eq!(p.status, Status::Called);
    assert_eq!(p.breach_count, 0);
    assert_eq!(p.last_publish_time, t.c.now());
    // Mark never moves margin.
    assert_eq!((p.margin_long, p.margin_short), (IM, IM));
}

#[test]
fn small_move_stays_open_and_short_loser_side() {
    let mut t = setup_position();
    // Spot well above strike: short loses a little, stays above the call threshold.
    let meta = mark_fresh(&mut t, 4_350_000).unwrap();
    let p: Position = t.c.fetch(t.position);
    let pnl = expected_pnl(&t.c, &p, 4_350_000);
    assert!(pnl > 0 && pnl < (IM / 2) as i128, "pnl {pnl}");
    let ev: Marked = event(&meta);
    assert_eq!(ev.loser_equity, IM as i128 - pnl);
    assert_eq!(ev.status, Status::Open);
    assert_eq!(p.status, Status::Open);
}

#[test]
fn breach_count_requires_gap_and_fresh_price() {
    let mut t = setup_position();
    // Deep loss: below the 20% liquidation threshold.
    let meta = mark_fresh(&mut t, P_38_5).unwrap();
    let p: Position = t.c.fetch(t.position);
    let pnl = expected_pnl(&t.c, &p, P_38_5);
    assert!(pnl < -((IM * 8 / 10) as i128), "pnl {pnl}");
    let ev: Marked = event(&meta);
    assert_eq!((ev.status, ev.breach_count), (Status::Called, 1));
    let t0 = t.c.now();
    assert_eq!((p.breach_count, p.last_breach_time, p.last_publish_time), (1, t0, t0));

    // Same publish_time again: rejected, nothing changes.
    let err = mark_now(&mut t).unwrap_err();
    assert_error(err, "StalePublishTime");
    // Even after time passes, the price account is unchanged (not fresh).
    advance_time(&mut t.c, 3);
    let err = mark_now(&mut t).unwrap_err();
    assert_error(err, "StalePublishTime");
    let p: Position = t.c.fetch(t.position);
    assert_eq!((p.breach_count, p.last_breach_time, p.last_publish_time), (1, t0, t0));
    warp_time(&mut t.c, t0);

    // Fresh price 1s later: gap 2 not met → count stays.
    let ev: Marked = event(&mark_fresh(&mut t, P_38_5).unwrap());
    assert_eq!(ev.breach_count, 1);
    let p: Position = t.c.fetch(t.position);
    assert_eq!((p.breach_count, p.last_breach_time, p.last_publish_time), (1, t0, t0 + 1));

    // 2s after the last counted breach → counts.
    let ev: Marked = event(&mark_fresh(&mut t, P_38_5).unwrap());
    assert_eq!(ev.breach_count, 2);
    let p: Position = t.c.fetch(t.position);
    assert_eq!((p.breach_count, p.last_breach_time), (2, t0 + 2));

    // Gap measured on the effective (demo-shifted) clock: an offset jump counts as elapsed time.
    set_demo_mode(&mut t.c, true).unwrap();
    set_demo_clock(&mut t.c, 10).unwrap();
    // Pyth publish_time must be within max age of effective now.
    let ev: Marked = event(&mark_fresh(&mut t, P_38_5).unwrap());
    assert_eq!(ev.breach_count, 3);
    let p: Position = t.c.fetch(t.position);
    assert_eq!(p.last_breach_time, t.c.now() + 10);
}

#[test]
fn healthy_mark_resets_breach() {
    let mut t = setup_position();
    mark_fresh(&mut t, P_38_5).unwrap();
    advance_time(&mut t.c, 1);
    let ev: Marked = event(&mark_fresh(&mut t, P_38_5).unwrap());
    assert_eq!(ev.breach_count, 2);

    // Recovery into the call band (above liq threshold) resets the counter but stays Called.
    let ev: Marked = event(&mark_fresh(&mut t, P_39_8).unwrap());
    assert_eq!((ev.status, ev.breach_count), (Status::Called, 0));

    // Breach again, then full recovery → Open, count 0.
    let ev: Marked = event(&mark_fresh(&mut t, P_38_5).unwrap());
    assert_eq!(ev.breach_count, 1);
    let ev: Marked = event(&mark_fresh(&mut t, P_42).unwrap());
    assert_eq!((ev.status, ev.breach_count), (Status::Open, 0));
    let p: Position = t.c.fetch(t.position);
    assert_eq!((p.status, p.breach_count), (Status::Open, 0));
}

#[test]
fn add_margin_restores_open() {
    let mut t = setup_position();
    mark_fresh(&mut t, P_39_8).unwrap();
    assert_eq!(t.c.fetch::<Position>(t.position).status, Status::Called);

    let usdc = t.c.usdc;
    let taker = t.c.taker.insecure_clone();
    let taker_ata = t.c.ata_of(taker.pubkey(), usdc);
    let (bal0, vault0) = (t.c.balance(taker_ata), t.c.balance(vault_pda(usdc)));
    let amount = 500 * ONE;
    let meta = add_margin(&mut t.c, &taker, t.position, Side::Long, amount).unwrap();
    let ev: MarginAdded = event(&meta);
    assert_eq!((ev.position, ev.side, ev.amount, ev.margin), (t.position, Side::Long, amount, IM + amount));
    assert_eq!(t.c.balance(taker_ata), bal0 - amount);
    assert_eq!(t.c.balance(vault_pda(usdc)), vault0 + amount);
    let p: Position = t.c.fetch(t.position);
    assert_eq!((p.margin_long, p.margin_short), (IM + amount, IM));
    // add_margin does not itself change status; the next mark re-evaluates.
    assert_eq!(p.status, Status::Called);

    let ev: Marked = event(&mark_fresh(&mut t, P_39_8).unwrap());
    assert_eq!(ev.status, Status::Open);
    assert_eq!(ev.loser_equity, (IM + amount) as i128 + ev.pnl_long);
    assert_eq!(t.c.fetch::<Position>(t.position).status, Status::Open);
}

#[test]
fn add_margin_validation() {
    let mut t = setup_position();
    let (maker, taker) = (t.c.maker.insecure_clone(), t.c.taker.insecure_clone());
    // Taker is long; maker is short.
    assert_error(add_margin(&mut t.c, &taker, t.position, Side::Short, ONE).unwrap_err(), "Unauthorized");
    assert_error(add_margin(&mut t.c, &maker, t.position, Side::Long, ONE).unwrap_err(), "Unauthorized");
    assert_error(add_margin(&mut t.c, &taker, t.position, Side::Long, 0).unwrap_err(), "InvalidParams");
    // Maker tops up the short side.
    add_margin(&mut t.c, &maker, t.position, Side::Short, 7 * ONE).unwrap();
    let p: Position = t.c.fetch(t.position);
    assert_eq!((p.margin_long, p.margin_short), (IM, IM + 7 * ONE));
    // Closed positions reject top-ups.
    for s in [Status::Settled, Status::Liquidated] {
        set_status(&mut t.c, t.position, s);
        assert_error(add_margin(&mut t.c, &taker, t.position, Side::Long, ONE).unwrap_err(), "PositionClosed");
    }
}

#[test]
fn mark_rejects_closed_and_keeps_partial_liquidation() {
    let mut t = setup_position();
    for s in [Status::Settled, Status::Liquidated] {
        set_status(&mut t.c, t.position, s);
        assert_error(mark_fresh(&mut t, P_42).unwrap_err(), "PositionClosed");
    }
    // PartiallyLiquidated is never downgraded to Open/Called.
    set_status(&mut t.c, t.position, Status::PartiallyLiquidated);
    let ev: Marked = event(&mark_fresh(&mut t, P_42).unwrap());
    assert_eq!(ev.status, Status::PartiallyLiquidated);
    let ev: Marked = event(&mark_fresh(&mut t, P_39_8).unwrap());
    assert_eq!(ev.status, Status::PartiallyLiquidated);
    let ev: Marked = event(&mark_fresh(&mut t, P_38_5).unwrap());
    assert_eq!((ev.status, ev.breach_count), (Status::PartiallyLiquidated, 1));
}

#[test]
fn mark_after_maturity_uses_zero_tau() {
    let mut t = setup_position();
    let maturity = t.c.fetch::<Position>(t.position).maturity;
    warp_time(&mut t.c, maturity + 100);
    let meta = mark_fresh(&mut t, P_42).unwrap();
    let p: Position = t.c.fetch(t.position);
    let ev: Marked = event(&meta);
    // expected_pnl clamps τ at 0 (spot = forward, no discount).
    assert_eq!(ev.pnl_long, expected_pnl(&t.c, &p, P_42));
}

#[test]
fn mark_rejects_wrong_market_or_rates() {
    let mut t = setup_position();
    advance_time(&mut t.c, 1);
    let pa = t.pa;
    write_px(&mut t.c, pa, P_42);
    // Swapped rate PDAs fail the seeds check.
    let mut i = mark_ix(&t.c, t.position, pa, pa);
    let (rb, rq) = (i.accounts[3].pubkey, i.accounts[4].pubkey);
    i.accounts[3].pubkey = rq;
    i.accounts[4].pubkey = rb;
    let payer = t.c.taker.insecure_clone();
    assert_error(send(&mut t.c, &[i], &[&payer]).unwrap_err(), "ConstraintSeeds");
}
