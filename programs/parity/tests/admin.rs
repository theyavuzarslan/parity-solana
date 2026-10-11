mod common;
use common::*;

#[test]
fn initialize_and_set_rate() {
    let mut c = setup();
    init_all(&mut c); // initialize + init_collateral(USDC) + init_collateral(USDG) + demo state
    set_rate(&mut c, *b"TRY", 4000, 365).unwrap();
    let r: parity::state::Rate = c.fetch(pda(&[b"rate", b"TRY"]));
    assert_eq!((r.rate_bps, r.basis_days), (4000, 365));
}

#[test]
fn non_admin_rejected() {
    let mut c = setup();
    init_all(&mut c);
    let taker = c.taker.insecure_clone();
    let err = set_rate_as(&mut c, &taker, *b"TRY", 1, 365).unwrap_err();
    assert_error(err, "Unauthorized");
}

#[test]
fn market_im_floor_enforced() {
    let mut c = setup();
    init_all(&mut c);
    let mut m = usd_try_market_args();
    m.im_bps = 800;
    assert_error(upsert_market(&mut c, m).unwrap_err(), "InvalidParams");
}

#[test]
fn demo_ixs_require_demo_mode() {
    let mut c = setup();
    init_all(&mut c);
    assert_error(set_demo_price(&mut c, 0, 1, 1, true).unwrap_err(), "DemoModeOff");
    set_demo_mode(&mut c, true).unwrap();
    set_demo_price(&mut c, 0, 42 * 100_000_000, 0, true).unwrap();
}

#[test]
fn wrong_mint_rejected_for_collateral() {
    let mut c = setup();
    init_all(&mut c);
    let rogue = create_spl_mint(&mut c);
    assert_error(init_collateral(&mut c, rogue).unwrap_err(), "InvalidMint");
}

// ----- additional coverage -----

#[test]
fn initialize_stores_config_and_creates_accounts() {
    let mut c = setup();
    init_all(&mut c);
    let cfg: parity::state::Config = c.fetch(config_pda());
    assert_eq!(cfg.admin, c.admin.pubkey());
    assert_eq!((cfg.usdc_mint, cfg.usdg_mint), (c.usdc, c.usdg));
    assert!(!cfg.demo_mode);
    assert_eq!(cfg.demo_clock_offset, 0);
    assert_eq!(cfg.params, default_params());
    let demo: parity::state::DemoState = c.fetch(demo_pda());
    assert!(demo.prices.iter().all(|p| !p.set));
    for mint in [c.usdc, c.usdg] {
        let tp = c.token_program_of(mint);
        for acc in [vault_pda(mint), insurance_pda(mint)] {
            let a = c.svm.get_account(&acc).expect("token account exists");
            assert_eq!(a.owner, tp);
        }
    }
    // second initialize fails (account already in use)
    assert!(initialize(&mut c, default_params()).is_err());
}

#[test]
fn initialize_rejects_bad_params() {
    let mut c = setup();
    let mut p = default_params();
    p.liq_equity_bps = p.call_equity_bps;
    assert_error(initialize(&mut c, p).unwrap_err(), "InvalidParams");
}

#[test]
fn set_params_validates_and_updates() {
    let mut c = setup();
    init_all(&mut c);
    let base = default_params();
    let bad: Vec<parity::state::RiskParams> = vec![
        parity::state::RiskParams { open_fee_bps: 10_001, ..base },
        parity::state::RiskParams { liq_equity_bps: 6000, ..base },
        parity::state::RiskParams { max_price_age_secs: 0, ..base },
        parity::state::RiskParams { liq_confirm_marks: 0, ..base },
        parity::state::RiskParams { max_conf_bps: 10_001, ..base },
    ];
    for p in bad {
        assert_error(set_params(&mut c, p).unwrap_err(), "InvalidParams");
    }
    let good = parity::state::RiskParams { liq_confirm_min_gap_secs: 30, open_fee_bps: 5, ..base };
    set_params(&mut c, good).unwrap();
    let cfg: parity::state::Config = c.fetch(config_pda());
    assert_eq!(cfg.params, good);
    let taker = c.taker.insecure_clone();
    let i = set_params_ix(taker.pubkey(), base);
    assert_error(send(&mut c, &[i], &[&taker]).unwrap_err(), "Unauthorized");
}

#[test]
fn set_rate_basis_and_update() {
    let mut c = setup();
    init_all(&mut c);
    assert_error(set_rate(&mut c, *b"TRY", 4000, 364).unwrap_err(), "InvalidParams");
    set_rate(&mut c, *b"USD", 400, 360).unwrap();
    set_rate(&mut c, *b"USD", 425, 360).unwrap(); // upsert
    let r: parity::state::Rate = c.fetch(rate_pda(*b"USD"));
    assert_eq!((r.code, r.rate_bps, r.basis_days, r.updated_at), (*b"USD", 425, 360, START_TS));
}

#[test]
fn upsert_market_creates_and_updates() {
    let mut c = setup();
    init_all(&mut c);
    let m = usd_try_market_args();
    upsert_market(&mut c, m).unwrap();
    let got: parity::state::Market = c.fetch(market_pda(0));
    assert_eq!((got.id, got.symbol, got.feed_a, got.im_bps, got.active), (0, m.symbol, m.feed_a, 1000, true));
    let m2 = parity::state::MarketArgs { im_bps: 1500, active: false, ..m };
    upsert_market(&mut c, m2).unwrap();
    let got: parity::state::Market = c.fetch(market_pda(0));
    assert_eq!((got.im_bps, got.active), (1500, false));
}

#[test]
fn upsert_market_validation() {
    let mut c = setup();
    init_all(&mut c);
    let m = usd_try_market_args();
    let bad = [
        parity::state::MarketArgs { op: 3, ..m },
        parity::state::MarketArgs { quote_conv: 3, ..m },
        parity::state::MarketArgs { scale_den: 0, ..m },
        parity::state::MarketArgs { id: 16, ..m },
        parity::state::MarketArgs { im_bps: 10_001, ..m },
    ];
    for a in bad {
        assert_error(upsert_market(&mut c, a).unwrap_err(), "InvalidParams");
    }
    let taker = c.taker.insecure_clone();
    let i = upsert_market_ix(taker.pubkey(), m);
    assert_error(send(&mut c, &[i], &[&taker]).unwrap_err(), "Unauthorized");
}

#[test]
fn demo_price_and_clock() {
    let mut c = setup();
    init_all(&mut c);
    assert_error(set_demo_clock(&mut c, 3600).unwrap_err(), "DemoModeOff");
    set_demo_mode(&mut c, true).unwrap();
    set_demo_clock(&mut c, 3600).unwrap();
    set_demo_price(&mut c, 3, 7, 9, true).unwrap();
    assert_error(set_demo_price(&mut c, 16, 1, 1, true).unwrap_err(), "InvalidMarket");
    let cfg: parity::state::Config = c.fetch(config_pda());
    assert!(cfg.demo_mode);
    assert_eq!(cfg.demo_clock_offset, 3600);
    let demo: parity::state::DemoState = c.fetch(demo_pda());
    assert_eq!((demo.prices[3].a, demo.prices[3].b, demo.prices[3].set), (7, 9, true));
    set_demo_price(&mut c, 3, 0, 0, false).unwrap();
    let demo: parity::state::DemoState = c.fetch(demo_pda());
    assert!(!demo.prices[3].set);
    set_demo_mode(&mut c, false).unwrap();
    let cfg: parity::state::Config = c.fetch(config_pda());
    assert!(!cfg.demo_mode);
}

#[test]
fn fund_insurance_moves_tokens() {
    let mut c = setup();
    init_all(&mut c);
    let admin = c.admin.pubkey();
    for mint in [c.usdc, c.usdg] {
        mint_to(&mut c, mint, admin, 500 * ONE).unwrap();
        fund_insurance(&mut c, mint, 200 * ONE).unwrap();
        assert_eq!(c.balance(insurance_pda(mint)), 200 * ONE);
        assert_eq!(c.balance(c.ata_of(admin, mint)), 300 * ONE);
    }
    let usdc = c.usdc;
    assert_error(fund_insurance(&mut c, usdc, 0).unwrap_err(), "InvalidParams");
}

#[test]
fn harness_price_update_and_warp() {
    let mut c = setup();
    let addr = Keypair::new().pubkey();
    write_price_update(&mut c, addr, [7u8; 32], 4_212_345_678, 1_000, -8, START_TS);
    let a = c.svm.get_account(&addr).unwrap();
    assert_eq!((a.data.len(), a.owner), (134, PYTH_RECEIVER));
    assert_eq!(&a.data[0..8], &[0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd]);
    assert_eq!(&a.data[41..73], &[7u8; 32]);
    warp_time(&mut c, START_TS + 100);
    assert_eq!(c.now(), START_TS + 100);
    assert_eq!(c.balance(c.ata_of(c.maker.pubkey(), c.usdg)), INITIAL_BALANCE);
}
