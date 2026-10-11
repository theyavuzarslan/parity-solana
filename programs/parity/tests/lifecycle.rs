//! `liquidate` / `settle` tests: partial and full liquidation through the loss waterfall
//! (loser margin → insurance → winner haircut), settlement at/after maturity, payout-account
//! constraints, Token-2022 collateral, and exact token conservation.
mod common;
use anchor_lang::prelude::Pubkey;
use common::*;
use parity::{
    math::{forward, pnl_long_usd},
    state::{MakerOffer, Position, Side, Status},
    Liquidated, Marked, PartiallyLiquidated, Settled,
};

const USD_TRY_FEED: [u8; 32] = [1u8; 32];
const USD_RATE_BPS: i64 = 450;
const TRY_RATE_BPS: i64 = 4000;
const N_10K: u64 = 10_000 * ONE;
const IM: u64 = 1_000 * ONE;
const TENOR: u16 = 90;
/// USD/TRY prices at expo -5.
const P_42: i64 = 4_200_000;
const P_30: i64 = 3_000_000;

struct T {
    c: Ctx,
    mint: Pubkey,
    offer: Pubkey,
    position: Pubkey,
    pa: Pubkey,
    keeper: Keypair,
}

impl T {
    fn pos(&self) -> Position {
        self.c.fetch(self.position)
    }
    fn long_ata(&self) -> Pubkey {
        self.c.ata_of(self.c.taker.pubkey(), self.mint)
    }
    fn short_ata(&self) -> Pubkey {
        self.c.ata_of(self.c.maker.pubkey(), self.mint)
    }
    fn keeper_ata(&self) -> Pubkey {
        self.c.ata_of(self.keeper.pubkey(), self.mint)
    }
    fn vault(&self) -> u64 {
        self.c.balance(vault_pda(self.mint))
    }
    fn insurance(&self) -> u64 {
        self.c.balance(insurance_pda(self.mint))
    }
    /// Vault + insurance + every token account that can receive funds in these tests.
    fn total(&self) -> u64 {
        [vault_pda(self.mint), insurance_pda(self.mint), self.long_ata(), self.short_ata(), self.keeper_ata()]
            .iter()
            .map(|a| self.c.balance(*a))
            .sum()
    }
}

fn write_px(c: &mut Ctx, addr: Pubkey, price: i64) {
    let now = c.now();
    write_price_update(c, addr, USD_TRY_FEED, price, 1_000, -5, now);
}

/// Market + rates + a funded keeper with an (empty) ATA for the mint. No position yet.
fn setup_base(use_usdg: bool) -> T {
    let mut c = setup_market();
    set_rate(&mut c, *b"USD", USD_RATE_BPS, 360).unwrap();
    set_rate(&mut c, *b"TRY", TRY_RATE_BPS, 365).unwrap();
    let mint = if use_usdg { c.usdg } else { c.usdc };
    let keeper = Keypair::new();
    c.svm.airdrop(&keeper.pubkey(), 10_000_000_000).unwrap();
    create_ata(&mut c, keeper.pubkey(), mint);
    let offer = offer_pda(c.maker.pubkey(), 1);
    let pa = Keypair::new().pubkey();
    T { c, mint, offer, position: position_pda(offer, 0), pa, keeper }
}

/// Default offer (maker Short); taker goes long $10k for `TENOR` days at 42.
fn setup_position(use_usdg: bool) -> T {
    let mut t = setup_base(use_usdg);
    let mint = t.mint;
    create_offer(&mut t.c, mint, default_offer()).unwrap();
    write_px(&mut t.c, t.pa, P_42);
    take_offer(&mut t.c, t.offer, t.pa, t.pa, N_10K, TENOR).unwrap();
    t
}

/// Advance past the breach gap (2s), publish a fresh price and mark (keeper pays).
fn mark_at(t: &mut T, price: i64) -> Marked {
    advance_time(&mut t.c, 2);
    write_px(&mut t.c, t.pa, price);
    let keeper = t.keeper.insecure_clone();
    event(&mark_as(&mut t.c, &keeper, t.position, t.pa, t.pa).unwrap())
}

fn confirm_breaches(t: &mut T, price: i64, n: u8) {
    for _ in 0..n {
        mark_at(t, price);
    }
}

fn liq(t: &mut T) -> TxResult {
    let keeper = t.keeper.insecure_clone();
    liquidate(&mut t.c, &keeper, t.position, t.pa, t.pa)
}

fn settle_now(t: &mut T) -> TxResult {
    let keeper = t.keeper.insecure_clone();
    settle(&mut t.c, &keeper, t.position, t.pa, t.pa)
}

fn bps(x: u64, b: u64) -> u64 {
    (x as u128 * b as u128 / 10_000) as u64
}

/// Long PnL recomputed with the program's math for position `p` at the current clock.
fn expected_pnl(c: &Ctx, p: &Position, price: i64) -> i128 {
    let spot = price as u64 * 1_000;
    let upq = (10_000_000_000_000_000u128 / spot as u128) as u64;
    let tau = (p.maturity - c.now()).max(0);
    let f = forward(spot, USD_RATE_BPS, 360, TRY_RATE_BPS, 365, tau).unwrap();
    pnl_long_usd(p.qty, f, p.strike, upq, TRY_RATE_BPS, 365, tau).unwrap()
}

/// Lowest price (expo -5) at which the long loses at most `loss` (PnL is increasing in price).
fn price_for_long_loss(c: &Ctx, p: &Position, loss: u64) -> i64 {
    let (mut lo, mut hi) = (1_000_000i64, 6_000_000i64);
    while lo < hi {
        let mid = (lo + hi) / 2;
        if expected_pnl(c, p, mid) >= -(loss as i128) {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    lo
}

/// Loss of $815 on $1,000 IM: liquidatable (equity < 20% IM) but survives the 30% partial
/// (equity − $30 penalty ≥ 20% of the reduced $700 IM).
fn partial_price(t: &T) -> i64 {
    price_for_long_loss(&t.c, &t.pos(), 815 * ONE)
}

#[test]
fn full_lifecycle_usdc() {
    let mut t = setup_position(false);
    let total0 = t.total();
    let p0 = t.pos();
    assert_eq!((p0.margin_long, p0.margin_short, p0.im_per_side), (IM, IM, IM));

    // Shock into the call band.
    let p_call = price_for_long_loss(&t.c, &p0, 650 * ONE);
    let ev = mark_at(&mut t, p_call);
    assert_eq!((ev.status, ev.breach_count), (Status::Called, 0));
    assert_eq!(t.total(), total0);

    // Three confirmed breaches below the liquidation threshold.
    let p_part = partial_price(&t);
    confirm_breaches(&mut t, p_part, 3);
    assert_eq!(t.pos().breach_count, 3);

    // Partial liquidation (same publish_time as the last mark is accepted).
    let (ins0, keeper0, vault0) = (t.insurance(), t.c.balance(t.keeper_ata()), t.vault());
    let pnl = expected_pnl(&t.c, &t.pos(), p_part);
    let meta = liq(&mut t).unwrap();
    assert!(events::<Liquidated>(&meta).is_empty(), "partial must not fall through");
    let ev: PartiallyLiquidated = event(&meta);
    let realized = bps(pnl.unsigned_abs() as u64, 3000);
    let penalty = bps(bps(N_10K, 3000), 100);
    let reward = bps(penalty, 2000);
    assert_eq!(ev.position, t.position);
    assert_eq!((ev.realized, ev.from_insurance, ev.shortfall), (realized, 0, 0));
    assert_eq!((ev.penalty, ev.reward), (penalty, reward));
    assert_eq!(ev.remaining_qty, bps(p0.qty, 7000));
    let p1 = t.pos();
    assert_eq!(p1.status, Status::PartiallyLiquidated);
    assert_eq!((p1.qty, p1.notional_usd, p1.im_per_side), (bps(p0.qty, 7000), 7_000 * ONE, 700 * ONE));
    assert_eq!(p1.strike, p0.strike);
    assert_eq!((p1.margin_long, p1.margin_short), (IM - realized - penalty, IM + realized));
    assert_eq!((p1.breach_count, p1.last_breach_time), (0, 0));
    // Insurance untouched by the loss; it only gains the penalty net of the reward.
    assert_eq!(t.insurance(), ins0 + penalty - reward);
    assert_eq!(t.c.balance(t.keeper_ata()), keeper0 + reward);
    assert_eq!(t.vault(), vault0 - penalty);
    assert_eq!(t.total(), total0);

    // Gap to 30: the remaining loss exceeds loser margin + the whole insurance fund.
    confirm_breaches(&mut t, P_30, 3);
    assert_eq!(t.total(), total0);
    let p2 = t.pos();
    let pnl2 = expected_pnl(&t.c, &p2, P_30);
    let ins1 = t.insurance();
    let owed = pnl2.unsigned_abs() as u64;
    assert!(owed > p2.margin_long + ins1, "gap must exhaust the waterfall");
    let (long0, short0, vault1) = (t.c.balance(t.long_ata()), t.c.balance(t.short_ata()), t.vault());

    let meta = liq(&mut t).unwrap();
    assert!(events::<PartiallyLiquidated>(&meta).is_empty());
    let ev: Liquidated = event(&meta);
    assert_eq!(ev.pnl_long, pnl2);
    assert_eq!((ev.from_loser, ev.from_insurance), (p2.margin_long, ins1));
    assert_eq!(ev.shortfall, owed - p2.margin_long - ins1);
    assert_eq!((ev.penalty, ev.reward), (0, 0)); // loser margin exhausted
    // Winner (short) gets its margin + everything the waterfall could cover; loser gets nothing.
    assert_eq!(t.c.balance(t.short_ata()), short0 + p2.margin_short + p2.margin_long + ins1);
    assert_eq!(t.c.balance(t.long_ata()), long0);
    assert_eq!(t.insurance(), 0);
    assert_eq!(t.vault(), vault1 - p2.margin_long - p2.margin_short);
    // Only the maker's still-locked offer margin remains in the vault.
    assert_eq!(t.vault(), t.c.fetch::<MakerOffer>(t.offer).margin_locked);
    let p3 = t.pos();
    assert_eq!((p3.status, p3.margin_long, p3.margin_short), (Status::Liquidated, 0, 0));
    assert_eq!(t.total(), total0);

    // Closed for good.
    advance_time(&mut t.c, 2);
    write_px(&mut t.c, t.pa, P_42);
    assert_error(liq(&mut t).unwrap_err(), "PositionClosed");
    let keeper = t.keeper.insecure_clone();
    assert_error(mark_as(&mut t.c, &keeper, t.position, t.pa, t.pa).unwrap_err(), "PositionClosed");
    warp_time(&mut t.c, p3.maturity);
    write_px(&mut t.c, t.pa, P_42);
    assert_error(settle_now(&mut t).unwrap_err(), "PositionClosed");
}

#[test]
fn partial_falls_through_to_full() {
    let mut t = setup_position(false);
    let total0 = t.total();
    let p0 = t.pos();
    // $900 loss: after a 30% partial, equity ≈ $70 < 20% of $700 → full close in the same ix.
    let price = price_for_long_loss(&t.c, &p0, 900 * ONE);
    confirm_breaches(&mut t, price, 3);
    let (long0, short0, ins0, keeper0) =
        (t.c.balance(t.long_ata()), t.c.balance(t.short_ata()), t.insurance(), t.c.balance(t.keeper_ata()));
    let pnl = expected_pnl(&t.c, &p0, price);
    let meta = liq(&mut t).unwrap();
    let part: PartiallyLiquidated = event(&meta);
    let full: Liquidated = event(&meta);

    // Model: partial on 30%, then full on the remaining 70% at the same price.
    let realized = bps(pnl.unsigned_abs() as u64, 3000);
    let pen1 = bps(bps(N_10K, 3000), 100);
    assert_eq!((part.realized, part.from_insurance, part.shortfall, part.penalty), (realized, 0, 0, pen1));
    let ml = IM - realized - pen1;
    let ms = IM + realized;
    let reduced = Position { qty: bps(p0.qty, 7000), ..p0.clone() };
    let pnl2 = expected_pnl(&t.c, &reduced, price);
    assert_eq!(full.pnl_long, pnl2);
    let owed = pnl2.unsigned_abs() as u64;
    assert!(owed < ml, "covered by loser margin");
    assert_eq!((full.from_loser, full.from_insurance, full.shortfall), (owed, 0, 0));
    let pen2 = bps(7_000 * ONE, 100).min(ml - owed);
    assert_eq!((full.penalty, full.reward), (pen2, bps(pen2, 2000)));
    let rewards = bps(pen1, 2000) + bps(pen2, 2000);
    assert_eq!(t.c.balance(t.keeper_ata()), keeper0 + rewards);
    assert_eq!(t.insurance(), ins0 + pen1 + pen2 - rewards);
    assert_eq!(t.c.balance(t.short_ata()), short0 + ms + owed);
    assert_eq!(t.c.balance(t.long_ata()), long0 + ml - owed - pen2);
    let p = t.pos();
    assert_eq!((p.status, p.margin_long, p.margin_short), (Status::Liquidated, 0, 0));
    assert_eq!(t.total(), total0);
}

#[test]
fn liquidator_reward_paid() {
    let mut t = setup_position(false);
    let price = partial_price(&t);
    confirm_breaches(&mut t, price, 3);
    let keeper0 = t.c.balance(t.keeper_ata());
    let ev: PartiallyLiquidated = event(&liq(&mut t).unwrap());
    let expected = bps(bps(bps(N_10K, 3000), 100), 2000);
    assert_eq!(ev.reward, expected);
    assert_eq!(t.c.balance(t.keeper_ata()), keeper0 + expected);

    // The reward account must belong to the signing caller.
    let mut t = setup_position(false);
    confirm_breaches(&mut t, price, 3);
    let attacker = Keypair::new();
    t.c.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    let keeper_ata = t.keeper_ata();
    let i = liquidate_ix(&t.c, attacker.pubkey(), keeper_ata, t.position, t.pa, t.pa);
    assert_error(send(&mut t.c, &[i], &[&attacker]).unwrap_err(), "ConstraintTokenOwner");
}

#[test]
fn partial_resets_breach() {
    let mut t = setup_position(false);
    let price = partial_price(&t);
    // Ruling (a): a healthy mark clears last_breach_time too.
    mark_at(&mut t, price);
    assert_ne!(t.pos().last_breach_time, 0);
    let ev = mark_at(&mut t, P_42);
    assert_eq!(ev.breach_count, 0);
    assert_eq!(t.pos().last_breach_time, 0);

    confirm_breaches(&mut t, price, 3);
    liq(&mut t).unwrap();
    let p = t.pos();
    assert_eq!((p.status, p.breach_count, p.last_breach_time), (Status::PartiallyLiquidated, 0, 0));
    // A fresh liquidation needs a new set of confirmations.
    advance_time(&mut t.c, 2);
    write_px(&mut t.c, t.pa, P_30);
    assert_error(liq(&mut t).unwrap_err(), "NotConfirmed");
    let ev = mark_at(&mut t, P_30);
    assert_eq!((ev.status, ev.breach_count), (Status::PartiallyLiquidated, 1));
}

#[test]
fn liquidate_without_confirmation_rejected() {
    let mut t = setup_position(false);
    let price = partial_price(&t);
    confirm_breaches(&mut t, price, 2);
    assert_error(liq(&mut t).unwrap_err(), "NotConfirmed");

    // Confirmed, but the price recovered before the liquidation → not liquidatable.
    mark_at(&mut t, price);
    advance_time(&mut t.c, 1);
    write_px(&mut t.c, t.pa, P_42);
    assert_error(liq(&mut t).unwrap_err(), "NotLiquidatable");

    // A price older than the last mark is rejected.
    let last = t.pos().last_publish_time;
    write_price_update(&mut t.c, t.pa, USD_TRY_FEED, price, 1_000, -5, last - 1);
    assert_error(liq(&mut t).unwrap_err(), "StalePublishTime");
    assert_eq!(t.pos().status, Status::Called);
}

#[test]
fn settle_at_maturity_pays_difference() {
    let mut t = setup_position(false);
    let total0 = t.total();
    let p = t.pos();
    warp_time(&mut t.c, p.maturity);
    let price = 4_300_000;
    write_px(&mut t.c, t.pa, price);
    let pnl = expected_pnl(&t.c, &p, price);
    assert!(pnl < 0 && pnl.unsigned_abs() < IM as u128, "pnl {pnl}");
    let (long0, short0, vault0, ins0) =
        (t.c.balance(t.long_ata()), t.c.balance(t.short_ata()), t.vault(), t.insurance());
    let ev: Settled = event(&settle_now(&mut t).unwrap());
    let loss = pnl.unsigned_abs() as u64;
    assert_eq!(ev.position, t.position);
    assert_eq!((ev.pnl_long, ev.from_loser, ev.from_insurance, ev.shortfall), (pnl, loss, 0, 0));
    assert_eq!(t.c.balance(t.long_ata()), long0 + IM - loss);
    assert_eq!(t.c.balance(t.short_ata()), short0 + IM + loss);
    assert_eq!(t.vault(), vault0 - 2 * IM);
    assert_eq!(t.insurance(), ins0); // no penalty on settlement
    let p = t.pos();
    assert_eq!((p.status, p.margin_long, p.margin_short), (Status::Settled, 0, 0));
    assert_eq!(t.total(), total0);
    // Settling twice is rejected.
    advance_time(&mut t.c, 1);
    write_px(&mut t.c, t.pa, price);
    assert_error(settle_now(&mut t).unwrap_err(), "PositionClosed");
}

#[test]
fn settle_after_maturity_clamps_time() {
    let price = 4_700_000; // above strike: long wins
    let payouts = |late: i64| {
        let mut t = setup_position(false);
        let p = t.pos();
        warp_time(&mut t.c, p.maturity + late);
        write_px(&mut t.c, t.pa, price);
        let (long0, short0) = (t.c.balance(t.long_ata()), t.c.balance(t.short_ata()));
        let ev: Settled = event(&settle_now(&mut t).unwrap());
        (ev.pnl_long, t.c.balance(t.long_ata()) - long0, t.c.balance(t.short_ata()) - short0)
    };
    let on_time = payouts(0);
    let late = payouts(10 * 86_400);
    assert!(on_time.0 > 0);
    assert_eq!(on_time, late);
    assert_eq!(on_time.1, IM + on_time.0 as u64);
    assert_eq!(on_time.2, IM - on_time.0 as u64);
}

#[test]
fn settle_before_maturity_rejected() {
    let mut t = setup_position(false);
    let p = t.pos();
    warp_time(&mut t.c, p.maturity - 1);
    write_px(&mut t.c, t.pa, P_42);
    assert_error(settle_now(&mut t).unwrap_err(), "NotMatured");
    // The demo clock offset counts towards maturity.
    set_demo_mode(&mut t.c, true).unwrap();
    set_demo_clock(&mut t.c, 1).unwrap();
    let now = t.c.now();
    write_price_update(&mut t.c, t.pa, USD_TRY_FEED, P_42, 1_000, -5, now + 1);
    settle_now(&mut t).unwrap();
    assert_eq!(t.pos().status, Status::Settled);
}

#[test]
fn payout_redirect_rejected() {
    let mut t = setup_position(false);
    let p = t.pos();
    warp_time(&mut t.c, p.maturity);
    write_px(&mut t.c, t.pa, P_42);
    let attacker = Keypair::new();
    t.c.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    let mint = t.mint;
    let attacker_ata = create_ata(&mut t.c, attacker.pubkey(), mint);

    // Settle: attacker's ATA as long_ata, then swapped long/short ATAs. Anchor checks the
    // token owner before the ATA address, so a foreign ATA fails with ConstraintTokenOwner.
    let (l, s) = (t.long_ata(), t.short_ata());
    let base = settle_ix(&t.c, t.position, t.pa, t.pa);
    let long_idx = base.accounts.iter().position(|m| m.pubkey == l).unwrap();
    let short_idx = base.accounts.iter().position(|m| m.pubkey == s).unwrap();
    let mut i = base.clone();
    i.accounts[long_idx].pubkey = attacker_ata;
    assert_error(send(&mut t.c, &[i], &[&attacker]).unwrap_err(), "ConstraintTokenOwner");
    let mut i = base.clone();
    i.accounts[long_idx].pubkey = s;
    i.accounts[short_idx].pubkey = l;
    assert_error(send(&mut t.c, &[i], &[&attacker]).unwrap_err(), "ConstraintTokenOwner");
    assert_eq!(t.pos().status, Status::Open);

    // Liquidate: attacker's ATA as short_ata.
    let mut t = setup_position(false);
    let price = partial_price(&t);
    confirm_breaches(&mut t, price, 3);
    t.c.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    let mint = t.mint;
    let attacker_ata = create_ata(&mut t.c, attacker.pubkey(), mint);
    let s = t.short_ata();
    let (keeper, keeper_ata) = (t.keeper.insecure_clone(), t.keeper_ata());
    let mut i = liquidate_ix(&t.c, keeper.pubkey(), keeper_ata, t.position, t.pa, t.pa);
    let short_idx = i.accounts.iter().position(|m| m.pubkey == s).unwrap();
    i.accounts[short_idx].pubkey = attacker_ata;
    assert_error(send(&mut t.c, &[i], &[&keeper]).unwrap_err(), "ConstraintTokenOwner");
    assert_eq!(t.pos().status, Status::Called);
}

#[test]
fn usdg_open_and_settle() {
    let mut t = setup_position(true);
    assert_eq!(t.c.token_program_of(t.mint), TOKEN_2022_PROGRAM);
    let total0 = t.total();
    let p = t.pos();
    assert_eq!(p.mint, t.c.usdg);
    warp_time(&mut t.c, p.maturity);
    let price = 4_500_000;
    write_px(&mut t.c, t.pa, price);
    let pnl = expected_pnl(&t.c, &p, price);
    let (long0, short0) = (t.c.balance(t.long_ata()), t.c.balance(t.short_ata()));
    let ev: Settled = event(&settle_now(&mut t).unwrap());
    assert_eq!(ev.pnl_long, pnl);
    assert_eq!(t.c.balance(t.long_ata()), long0 + (IM as i128 + pnl) as u64);
    assert_eq!(t.c.balance(t.short_ata()), short0 + (IM as i128 - pnl) as u64);
    assert_eq!(t.pos().status, Status::Settled);
    assert_eq!(t.total(), total0);
}

#[test]
fn token_conservation_full_lifecycle() {
    let mut t = setup_base(false);
    let total0 = t.total();
    let mint = t.mint;
    create_offer(&mut t.c, mint, default_offer()).unwrap();
    assert_eq!(t.total(), total0);
    write_px(&mut t.c, t.pa, P_42);
    take_offer(&mut t.c, t.offer, t.pa, t.pa, N_10K, TENOR).unwrap();
    assert_eq!(t.total(), total0);
    // A second position on the same offer is settled at maturity at the end.
    take_offer(&mut t.c, t.offer, t.pa, t.pa, N_10K, TENOR).unwrap();
    let second = position_pda(t.offer, 1);
    assert_eq!(t.total(), total0);

    let taker = t.c.taker.insecure_clone();
    add_margin(&mut t.c, &taker, t.position, Side::Long, 50 * ONE).unwrap();
    assert_eq!(t.total(), total0);

    // +$50 margin shifts the partial-survival band to a loss of ($850, $880].
    let p_part = price_for_long_loss(&t.c, &t.pos(), 865 * ONE);
    for _ in 0..3 {
        mark_at(&mut t, p_part);
        assert_eq!(t.total(), total0);
    }
    let meta = liq(&mut t).unwrap();
    assert!(events::<Liquidated>(&meta).is_empty());
    assert_eq!(t.pos().status, Status::PartiallyLiquidated);
    assert_eq!(t.total(), total0);
    for _ in 0..3 {
        mark_at(&mut t, P_30);
        assert_eq!(t.total(), total0);
    }
    liq(&mut t).unwrap();
    assert_eq!(t.pos().status, Status::Liquidated);
    assert_eq!(t.total(), total0);

    let maturity = t.c.fetch::<Position>(second).maturity;
    warp_time(&mut t.c, maturity);
    write_px(&mut t.c, t.pa, P_30);
    let keeper = t.keeper.insecure_clone();
    let ev: Settled = event(&settle(&mut t.c, &keeper, second, t.pa, t.pa).unwrap());
    assert!(ev.shortfall > 0, "insurance is empty after the liquidation → haircut");
    assert_eq!(t.c.fetch::<Position>(second).status, Status::Settled);
    assert_eq!(t.total(), total0);

    cancel_offer(&mut t.c, t.offer, mint).unwrap();
    assert_eq!(t.total(), total0);
    assert_eq!(t.vault(), 0);
}

#[test]
fn mark_after_demo_clock_cleared() {
    // Ruling (c): a demo clock offset that is later reduced leaves last_publish_time in the
    // future; mark/settle treat it as 0 instead of rejecting every fresh price.
    let mut t = setup_position(false);
    set_demo_mode(&mut t.c, true).unwrap();
    set_demo_price(&mut t.c, 0, 4_100_000_000, 0, true).unwrap();
    set_demo_clock(&mut t.c, 1_000).unwrap();
    let keeper = t.keeper.insecure_clone();
    advance_time(&mut t.c, 1);
    mark_as(&mut t.c, &keeper, t.position, t.pa, t.pa).unwrap();
    assert_eq!(t.pos().last_publish_time, t.c.now() + 1_000);

    set_demo_clock(&mut t.c, 0).unwrap();
    advance_time(&mut t.c, 1);
    let ev: Marked = event(&mark_as(&mut t.c, &keeper, t.position, t.pa, t.pa).unwrap());
    assert_eq!(ev.position, t.position);
    assert_eq!(t.pos().last_publish_time, t.c.now());

    // Settle: real time just before maturity, an offset pushes effective time well past it,
    // then a smaller offset leaves last_publish_time ahead of effective now (still matured).
    let maturity = t.pos().maturity;
    warp_time(&mut t.c, maturity - 5);
    set_demo_clock(&mut t.c, 1_000).unwrap();
    advance_time(&mut t.c, 1);
    mark_as(&mut t.c, &keeper, t.position, t.pa, t.pa).unwrap();
    assert_eq!(t.pos().last_publish_time, maturity + 996);
    set_demo_clock(&mut t.c, 10).unwrap();
    advance_time(&mut t.c, 1);
    settle_now(&mut t).unwrap();
    assert_eq!(t.pos().status, Status::Settled);
}
