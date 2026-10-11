//! Maker offer tests: `create_offer` locks margin into the vault, `cancel_offer` returns it.
mod common;
use anchor_lang::{
    prelude::Pubkey,
    solana_program::{program_pack::Pack, system_instruction},
};
use anchor_spl::{
    token::spl_token,
    token_2022::spl_token_2022::{self, extension::ExtensionType},
};
use common::*;
use parity::state::{MakerOffer, MarketArgs, Side};

/// $100k capacity, IM 10%, spread 20 bps, protocol share 10%:
/// 10_000 USD IM + 10% of 200 USD spread = 10_020 USD.
const LOCKED_100K: u64 = 10_000_000_000 + 20_000_000;

#[test]
fn create_locks_margin() {
    let mut c = setup_market();
    let (usdc, maker) = (c.usdc, c.maker.pubkey());
    let maker_ata = c.ata_of(maker, usdc);
    create_offer(&mut c, usdc, default_offer()).unwrap();

    assert_eq!(c.balance(maker_ata), INITIAL_BALANCE - LOCKED_100K);
    assert_eq!(c.balance(vault_pda(usdc)), LOCKED_100K);
    let o: MakerOffer = c.fetch(offer_pda(maker, 1));
    assert_eq!(o.maker, maker);
    assert_eq!(o.nonce, 1);
    assert_eq!(o.market_id, 0);
    assert_eq!(o.mint, usdc);
    assert_eq!(o.maker_side, Side::Short);
    assert_eq!(o.spread_bps, 20);
    assert_eq!((o.min_tenor_days, o.max_tenor_days), (7, 90));
    assert_eq!(o.capacity_usd, CAP_100K);
    assert_eq!(o.margin_locked, LOCKED_100K);
    assert_eq!(o.position_counter, 0);
    assert!(o.active);

    // Reusing a nonce fails (PDA already initialized).
    assert!(create_offer(&mut c, usdc, default_offer()).is_err());
}

#[test]
fn cancel_returns_margin() {
    let mut c = setup_market();
    let (usdc, maker) = (c.usdc, c.maker.pubkey());
    let maker_ata = c.ata_of(maker, usdc);
    create_offer(&mut c, usdc, default_offer()).unwrap();
    let offer = offer_pda(maker, 1);
    cancel_offer(&mut c, offer, usdc).unwrap();

    assert_eq!(c.balance(maker_ata), INITIAL_BALANCE);
    assert_eq!(c.balance(vault_pda(usdc)), 0);
    let o: MakerOffer = c.fetch(offer);
    assert_eq!(o.margin_locked, 0);
    assert!(!o.active);

    // Second cancel: OfferInactive.
    assert_error(cancel_offer(&mut c, offer, usdc).unwrap_err(), "OfferInactive");
}

#[test]
fn cancel_by_non_maker_rejected() {
    let mut c = setup_market();
    let (usdc, maker) = (c.usdc, c.maker.pubkey());
    create_offer(&mut c, usdc, default_offer()).unwrap();
    let offer = offer_pda(maker, 1);
    let taker = c.taker.insecure_clone();

    // Taker signs, payout still pinned to the maker's ATA: has_one = maker fails.
    let maker_ata = c.ata_of(maker, usdc);
    let i = cancel_offer_ix(&c, taker.pubkey(), offer, usdc, maker_ata);
    assert_error(send(&mut c, &[i], &[&taker]).unwrap_err(), "Unauthorized");
    // Taker signs and points payout at their own ATA: still rejected.
    let taker_ata = c.ata_of(taker.pubkey(), usdc);
    let i = cancel_offer_ix(&c, taker.pubkey(), offer, usdc, taker_ata);
    assert!(send(&mut c, &[i], &[&taker]).is_err());

    assert_eq!(c.balance(vault_pda(usdc)), LOCKED_100K);
    assert!(c.fetch::<MakerOffer>(offer).active);
}

#[test]
fn cancel_to_non_canonical_ata_rejected() {
    let mut c = setup_market();
    let (usdc, maker) = (c.usdc, c.maker.pubkey());
    create_offer(&mut c, usdc, default_offer()).unwrap();
    let offer = offer_pda(maker, 1);
    let maker_kp = c.maker.insecure_clone();

    // A second (non-ATA) token account owned by the maker.
    let alt = Keypair::new();
    let len = spl_token::state::Account::LEN;
    let lamports = c.svm.minimum_balance_for_rent_exemption(len);
    let create = system_instruction::create_account(
        &maker, &alt.pubkey(), lamports, len as u64, &TOKEN_PROGRAM,
    );
    let init = spl_token::instruction::initialize_account3(&TOKEN_PROGRAM, &alt.pubkey(), &usdc, &maker).unwrap();
    send(&mut c, &[create, init], &[&maker_kp, &alt]).unwrap();

    let i = cancel_offer_ix(&c, maker, offer, usdc, alt.pubkey());
    assert_error(send(&mut c, &[i], &[&maker_kp]).unwrap_err(), "ConstraintAssociated");
    // The taker's ATA is canonical for the taker, not for offer.maker.
    let taker_ata = c.ata_of(c.taker.pubkey(), usdc);
    let i = cancel_offer_ix(&c, maker, offer, usdc, taker_ata);
    assert_error(send(&mut c, &[i], &[&maker_kp]).unwrap_err(), "ConstraintTokenOwner");

    assert_eq!(c.balance(alt.pubkey()), 0);
    assert_eq!(c.balance(vault_pda(usdc)), LOCKED_100K);
}

#[test]
fn tenor_bounds_validated() {
    let mut c = setup_market();
    let usdc = c.usdc;
    let bad = [(0, 30), (31, 30), (1, 366), (366, 366)];
    for (i, (min, max)) in bad.into_iter().enumerate() {
        let o = OfferArgs { nonce: 100 + i as u64, min_tenor: min, max_tenor: max, ..default_offer() };
        assert_error(create_offer(&mut c, usdc, o).unwrap_err(), "InvalidTenor");
    }
    // Boundaries accepted.
    create_offer(&mut c, usdc, OfferArgs { nonce: 1, min_tenor: 1, max_tenor: 365, ..default_offer() }).unwrap();
    create_offer(&mut c, usdc, OfferArgs { nonce: 2, min_tenor: 30, max_tenor: 30, ..default_offer() }).unwrap();

    // Spread bound.
    assert_error(
        create_offer(&mut c, usdc, OfferArgs { nonce: 3, spread_bps: 501, ..default_offer() }).unwrap_err(),
        "InvalidParams",
    );
    create_offer(&mut c, usdc, OfferArgs { nonce: 4, spread_bps: 500, ..default_offer() }).unwrap();
    // Minimum notional ($10).
    let min = default_params().min_notional;
    assert_error(
        create_offer(&mut c, usdc, OfferArgs { nonce: 5, capacity: min - 1, ..default_offer() }).unwrap_err(),
        "BelowMinNotional",
    );
    create_offer(&mut c, usdc, OfferArgs { nonce: 6, capacity: min, ..default_offer() }).unwrap();
}

#[test]
fn usdg_offer_works() {
    let mut c = setup_market();
    let (usdg, maker) = (c.usdg, c.maker.pubkey());
    assert_eq!(c.token_program_of(usdg), TOKEN_2022_PROGRAM);
    let maker_ata = c.ata_of(maker, usdg);
    create_offer(&mut c, usdg, OfferArgs { side: Side::Long, ..default_offer() }).unwrap();
    assert_eq!(c.balance(maker_ata), INITIAL_BALANCE - LOCKED_100K);
    assert_eq!(c.balance(vault_pda(usdg)), LOCKED_100K);
    let o: MakerOffer = c.fetch(offer_pda(maker, 1));
    assert_eq!(o.mint, usdg);
    assert_eq!(o.maker_side, Side::Long);

    cancel_offer(&mut c, offer_pda(maker, 1), usdg).unwrap();
    assert_eq!(c.balance(maker_ata), INITIAL_BALANCE);
    assert_eq!(c.balance(vault_pda(usdg)), 0);
}

#[test]
fn create_on_inactive_market_rejected() {
    let mut c = setup_market();
    let usdc = c.usdc;
    let inactive = MarketArgs { active: false, ..usd_try_market_args() };
    upsert_market(&mut c, inactive).unwrap();
    assert_error(create_offer(&mut c, usdc, default_offer()).unwrap_err(), "MarketInactive");
}

#[test]
fn disallowed_mint_rejected() {
    let mut c = setup_market();
    let other = create_spl_mint(&mut c);
    let maker = c.maker.pubkey();
    mint_to(&mut c, other, maker, INITIAL_BALANCE).unwrap();
    // Anchor deserializes every account before running constraints, so the missing vault
    // (init_collateral rejects non-allowed mints, so one can never exist) is reported first.
    assert_error(create_offer(&mut c, other, default_offer()).unwrap_err(), "AccountNotInitialized");
    assert!(c.try_fetch::<MakerOffer>(offer_pda(maker, 1)).is_none());
}

/// Token-2022 mint with the PermanentDelegate extension (admin as delegate).
fn create_permanent_delegate_mint(c: &mut Ctx) -> Pubkey {
    let mint = Keypair::new();
    let len = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&[
        ExtensionType::PermanentDelegate,
    ])
    .unwrap();
    let lamports = c.svm.minimum_balance_for_rent_exemption(len);
    let admin = c.admin.insecure_clone();
    let create = system_instruction::create_account(
        &admin.pubkey(), &mint.pubkey(), lamports, len as u64, &TOKEN_2022_PROGRAM,
    );
    let ext = spl_token_2022::instruction::initialize_permanent_delegate(&TOKEN_2022_PROGRAM, &mint.pubkey(), &admin.pubkey()).unwrap();
    let init = spl_token_2022::instruction::initialize_mint2(&TOKEN_2022_PROGRAM, &mint.pubkey(), &admin.pubkey(), None, DECIMALS).unwrap();
    send(c, &[create, ext, init], &[&admin, &mint]).expect("create permanent-delegate mint");
    mint.pubkey()
}

#[test]
fn init_collateral_rejects_forbidden_extension() {
    let mut c = setup();
    // Configure the protocol with a USDG that carries a PermanentDelegate.
    c.usdg = create_permanent_delegate_mint(&mut c);
    let (usdc, usdg) = (c.usdc, c.usdg);
    initialize(&mut c, default_params()).unwrap();
    init_collateral(&mut c, usdc).unwrap();
    assert_error(init_collateral(&mut c, usdg).unwrap_err(), "InvalidMint");
    assert!(c.svm.get_account(&vault_pda(usdg)).map_or(true, |a| a.data.is_empty()));
    assert!(c.svm.get_account(&insurance_pda(usdg)).map_or(true, |a| a.data.is_empty()));
}

#[test]
fn cancel_with_swapped_mint_rejected() {
    let mut c = setup_market();
    let (usdc, usdg, maker) = (c.usdc, c.usdg, c.maker.pubkey());
    create_offer(&mut c, usdc, default_offer()).unwrap();
    // Seed the USDG vault so a swapped-mint cancel would have funds to drain.
    create_offer(&mut c, usdg, OfferArgs { nonce: 2, ..default_offer() }).unwrap();
    let offer = offer_pda(maker, 1);
    let maker_kp = c.maker.insecure_clone();
    let usdg_ata = c.ata_of(maker, usdg);
    let i = cancel_offer_ix(&c, maker, offer, usdg, usdg_ata);
    assert_error(send(&mut c, &[i], &[&maker_kp]).unwrap_err(), "InvalidMint");
    assert_eq!(c.balance(vault_pda(usdg)), LOCKED_100K);
    assert_eq!(c.balance(vault_pda(usdc)), LOCKED_100K);
    assert!(c.fetch::<MakerOffer>(offer).active);
}

#[test]
fn offer_events_emitted() {
    let mut c = setup_market();
    let (usdc, maker) = (c.usdc, c.maker.pubkey());
    let offer = offer_pda(maker, 1);
    let meta = create_offer(&mut c, usdc, default_offer()).unwrap();
    let e: parity::OfferCreated = event(&meta);
    assert_eq!(e.offer, offer);
    assert_eq!(e.maker, maker);
    assert_eq!(e.market_id, 0);
    assert_eq!(e.mint, usdc);
    assert_eq!(e.maker_side, Side::Short);
    assert_eq!(e.spread_bps, 20);
    assert_eq!(e.capacity_usd, CAP_100K);
    assert_eq!(e.margin_locked, LOCKED_100K);

    let meta = cancel_offer(&mut c, offer, usdc).unwrap();
    let e: parity::OfferCancelled = event(&meta);
    assert_eq!(e.offer, offer);
    assert_eq!(e.refunded, LOCKED_100K);
}
