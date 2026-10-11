//! Shared LiteSVM test harness for the `parity` program (used by Tasks 2-7).
//!
//! Quick start:
//! ```ignore
//! mod common; use common::*;
//! let mut c = setup();      // SVM + program + funded admin/maker/taker + USDC/USDG mints
//! init_all(&mut c);         // initialize + init_collateral(USDC, USDG) (+ DemoState)
//! set_rate(&mut c, *b"TRY", 4000, 365).unwrap();
//! let r: parity::state::Rate = c.fetch(pda(&[b"rate", b"TRY"]));
//! ```
//!
//! Conventions:
//! - Every instruction wrapper returns `TxResult` so tests can `.unwrap()` or
//!   `assert_error(err, "VariantName")`.
//! - `send` expires the blockhash after every transaction, so sending an identical
//!   instruction twice never fails with `AlreadyProcessed`.
//! - Mock USDC is an SPL Token mint, mock USDG is a Token-2022 mint (no extensions);
//!   both have 6 decimals and `admin` as mint authority.
#![allow(dead_code)]

use anchor_lang::{
    prelude::{Clock, Pubkey},
    solana_program::{instruction::Instruction, program_pack::Pack, system_instruction},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use anchor_spl::{
    associated_token::{
        get_associated_token_address_with_program_id,
        spl_associated_token_account::instruction::create_associated_token_account_idempotent,
    },
    token::spl_token,
    token_2022::spl_token_2022,
};
use litesvm::{
    types::{FailedTransactionMetadata, TransactionMetadata},
    LiteSVM,
};
use parity::state::{MarketArgs, RiskParams, Side};
use solana_account::Account;
pub use solana_keypair::Keypair;
pub use solana_signer::Signer;
use solana_transaction::Transaction;

pub type TxResult = Result<TransactionMetadata, FailedTransactionMetadata>;

pub const PROGRAM_ID: Pubkey = parity::ID;
/// Pyth receiver program that owns `PriceUpdateV2` accounts.
pub const PYTH_RECEIVER: Pubkey =
    anchor_lang::pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
pub const TOKEN_PROGRAM: Pubkey = spl_token::ID;
pub const TOKEN_2022_PROGRAM: Pubkey = spl_token_2022::ID;
pub const SYSTEM_PROGRAM: Pubkey = anchor_lang::solana_program::system_program::ID;
/// Mock stablecoin decimals (USDC/USDG are both 6).
pub const DECIMALS: u8 = 6;
/// 1 whole token in base units.
pub const ONE: u64 = 1_000_000;
/// Initial balance minted to maker and taker for each mint: 1,000,000 tokens.
pub const INITIAL_BALANCE: u64 = 1_000_000 * ONE;
/// Start-of-test unix time set by `setup()` (2026-10-12T00:00:00Z).
pub const START_TS: i64 = 1_791_763_200;

pub struct Ctx {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub maker: Keypair,
    pub taker: Keypair,
    /// Mock USDC, SPL Token program.
    pub usdc: Pubkey,
    /// Mock USDG, Token-2022 program.
    pub usdg: Pubkey,
}

impl Ctx {
    /// Fetch and deserialize an Anchor account (checks the discriminator). Panics if missing.
    pub fn fetch<T: AccountDeserialize>(&self, addr: Pubkey) -> T {
        let acc = self
            .svm
            .get_account(&addr)
            .unwrap_or_else(|| panic!("account {addr} not found"));
        T::try_deserialize(&mut acc.data.as_slice()).expect("deserialize account")
    }

    /// Like `fetch` but returns None when the account does not exist.
    pub fn try_fetch<T: AccountDeserialize>(&self, addr: Pubkey) -> Option<T> {
        let acc = self.svm.get_account(&addr)?;
        if acc.data.is_empty() {
            return None;
        }
        T::try_deserialize(&mut acc.data.as_slice()).ok()
    }

    /// Token balance (base units) of any SPL Token / Token-2022 account; 0 if missing.
    pub fn balance(&self, token_account: Pubkey) -> u64 {
        match self.svm.get_account(&token_account) {
            Some(a) if a.data.len() >= 72 => u64::from_le_bytes(a.data[64..72].try_into().unwrap()),
            _ => 0,
        }
    }

    /// Owning token program of a mint (SPL Token or Token-2022).
    pub fn token_program_of(&self, mint: Pubkey) -> Pubkey {
        self.svm.get_account(&mint).expect("mint exists").owner
    }

    /// Associated token account of `owner` for `mint` (token program inferred from the mint).
    pub fn ata_of(&self, owner: Pubkey, mint: Pubkey) -> Pubkey {
        ata(owner, mint, self.token_program_of(mint))
    }

    /// Current (SVM) unix timestamp.
    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }
}

/// Fresh SVM with the program loaded from `target/deploy/parity.so` (run `anchor build` first),
/// admin/maker/taker airdropped 100 SOL, USDC (SPL) + USDG (Token-2022) mints created and
/// 1,000,000 tokens of each minted to maker and taker ATAs. Clock set to `START_TS`.
pub fn setup() -> Ctx {
    let mut svm = LiteSVM::new();
    let so = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/parity.so");
    svm.add_program_from_file(PROGRAM_ID, so)
        .expect("load target/deploy/parity.so (run `anchor build`)");
    let (admin, maker, taker) = (Keypair::new(), Keypair::new(), Keypair::new());
    for k in [&admin, &maker, &taker] {
        svm.airdrop(&k.pubkey(), 100_000_000_000).unwrap();
    }
    let mut c = Ctx { svm, admin, maker, taker, usdc: Pubkey::default(), usdg: Pubkey::default() };
    let admin_pk = c.admin.pubkey();
    set_upgrade_authority(&mut c, Some(admin_pk));
    warp_time(&mut c, START_TS);
    c.usdc = create_mint(&mut c, TOKEN_PROGRAM);
    c.usdg = create_mint(&mut c, TOKEN_2022_PROGRAM);
    let (maker, taker) = (c.maker.pubkey(), c.taker.pubkey());
    for mint in [c.usdc, c.usdg] {
        for owner in [maker, taker] {
            mint_to(&mut c, mint, owner, INITIAL_BALANCE).unwrap();
        }
    }
    c
}

/// Sign and send `ixs` with `signers[0]` as fee payer. Expires the blockhash afterwards.
pub fn send(c: &mut Ctx, ixs: &[Instruction], signers: &[&Keypair]) -> TxResult {
    let payer = signers.first().expect("at least one signer").pubkey();
    let tx = Transaction::new_signed_with_payer(ixs, Some(&payer), signers, c.svm.latest_blockhash());
    let res = c.svm.send_transaction(tx);
    c.svm.expire_blockhash();
    res
}

/// BPF upgradeable loader id.
pub const BPF_LOADER_UPGRADEABLE: Pubkey =
    anchor_lang::solana_program::bpf_loader_upgradeable::ID;

/// ProgramData account of the parity program (`[program_id]` under the upgradeable loader).
pub fn program_data_pda() -> Pubkey {
    Pubkey::find_program_address(&[PROGRAM_ID.as_ref()], &BPF_LOADER_UPGRADEABLE).0
}

/// Rewrite the program's ProgramData upgrade authority. LiteSVM's `add_program_from_file`
/// writes `None`; `setup()` sets it to admin so `initialize` (upgrade-authority gated) works.
/// Layout (bincode): [0..4] tag=3, [4..12] slot, [12] Option tag, [13..45] authority.
pub fn set_upgrade_authority(c: &mut Ctx, authority: Option<Pubkey>) {
    let addr = program_data_pda();
    let mut acc = c.svm.get_account(&addr).expect("programdata exists");
    assert_eq!(u32::from_le_bytes(acc.data[0..4].try_into().unwrap()), 3, "ProgramData tag");
    match authority {
        Some(a) => {
            acc.data[12] = 1;
            acc.data[13..45].copy_from_slice(a.as_ref());
        }
        None => {
            acc.data[12] = 0;
            acc.data[13..45].fill(0);
        }
    }
    c.svm.set_account(addr, acc).unwrap();
}

/// Program-derived address under the parity program id.
pub fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &PROGRAM_ID).0
}

pub fn config_pda() -> Pubkey { pda(&[b"config"]) }
pub fn demo_pda() -> Pubkey { pda(&[b"demo"]) }
pub fn rate_pda(code: [u8; 3]) -> Pubkey { pda(&[b"rate", &code]) }
pub fn market_pda(id: u16) -> Pubkey { pda(&[b"market", &id.to_le_bytes()]) }
pub fn vault_pda(mint: Pubkey) -> Pubkey { pda(&[b"vault", mint.as_ref()]) }
pub fn insurance_pda(mint: Pubkey) -> Pubkey { pda(&[b"insurance", mint.as_ref()]) }
pub fn offer_pda(maker: Pubkey, nonce: u64) -> Pubkey {
    pda(&[b"offer", maker.as_ref(), &nonce.to_le_bytes()])
}
pub fn position_pda(offer: Pubkey, index: u64) -> Pubkey {
    pda(&[b"position", offer.as_ref(), &index.to_le_bytes()])
}

/// Default risk parameters (spec values; `liq_confirm_min_gap_secs = 2` for fast tests).
pub fn default_params() -> RiskParams {
    RiskParams {
        open_fee_bps: 10,
        maker_fee_share_bps: 1000,
        liq_penalty_bps: 100,
        liquidator_reward_bps: 2000,
        partial_liq_bps: 3000,
        call_equity_bps: 5000,
        liq_equity_bps: 2000,
        liq_confirm_marks: 3,
        liq_confirm_min_gap_secs: 2,
        max_price_age_secs: 60,
        max_conf_bps: 50,
        min_notional: 10_000_000,
    }
}

/// Write a Pyth `PriceUpdateV2` account (134 bytes, owned by the Pyth receiver, verification Full).
pub fn write_price_update(
    c: &mut Ctx,
    addr: Pubkey,
    feed_id: [u8; 32],
    price: i64,
    conf: u64,
    expo: i32,
    publish_time: i64,
) {
    let mut d = vec![0u8; 134];
    d[0..8].copy_from_slice(&[0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd]);
    // [8..40] write_authority left zeroed
    d[40] = 1; // VerificationLevel::Full
    d[41..73].copy_from_slice(&feed_id);
    d[73..81].copy_from_slice(&price.to_le_bytes());
    d[81..89].copy_from_slice(&conf.to_le_bytes());
    d[89..93].copy_from_slice(&expo.to_le_bytes());
    d[93..101].copy_from_slice(&publish_time.to_le_bytes());
    d[101..109].copy_from_slice(&(publish_time - 1).to_le_bytes()); // prev_publish_time
    d[109..117].copy_from_slice(&price.to_le_bytes()); // ema_price
    d[117..125].copy_from_slice(&conf.to_le_bytes()); // ema_conf
    let slot = c.svm.get_sysvar::<Clock>().slot;
    d[125..133].copy_from_slice(&slot.to_le_bytes()); // posted_slot
    let lamports = c.svm.minimum_balance_for_rent_exemption(d.len());
    c.svm
        .set_account(addr, Account { lamports, data: d, owner: PYTH_RECEIVER, executable: false, rent_epoch: 0 })
        .unwrap();
}

/// Set the Clock sysvar's unix_timestamp (slot/epoch untouched).
pub fn warp_time(c: &mut Ctx, unix_ts: i64) {
    let mut clock = c.svm.get_sysvar::<Clock>();
    clock.unix_timestamp = unix_ts;
    c.svm.set_sysvar::<Clock>(&clock);
}

/// Advance the clock by `secs` seconds.
pub fn advance_time(c: &mut Ctx, secs: i64) {
    let now = c.now();
    warp_time(c, now + secs);
}

/// Assert a failed transaction carries the given `ParityError` (or any Anchor error) name.
/// Matches `Error Code: <name>.` in the logs; panics with the logs otherwise.
/// The trailing period is deliberate: it prevents prefix collisions between variant names.
pub fn assert_error(err: FailedTransactionMetadata, name: &str) {
    let needle = format!("Error Code: {name}.");
    if err.meta.logs.iter().any(|l| l.contains(&needle)) {
        return;
    }
    panic!("expected error `{name}`, got {:?}\nlogs:\n{}", err.err, err.meta.logs.join("\n"));
}

/// Associated token address for (owner, mint, token_program).
pub fn ata(owner: Pubkey, mint: Pubkey, token_program: Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(&owner, &mint, &token_program)
}

/// Create a 6-decimal mint under `token_program` with admin as mint authority.
pub fn create_mint(c: &mut Ctx, token_program: Pubkey) -> Pubkey {
    let mint = Keypair::new();
    let len = spl_token::state::Mint::LEN; // 82 for both programs when no extensions
    let lamports = c.svm.minimum_balance_for_rent_exemption(len);
    let admin = c.admin.pubkey();
    let create = system_instruction::create_account(&admin, &mint.pubkey(), lamports, len as u64, &token_program);
    let init = if token_program == TOKEN_2022_PROGRAM {
        spl_token_2022::instruction::initialize_mint2(&token_program, &mint.pubkey(), &admin, None, DECIMALS).unwrap()
    } else {
        spl_token::instruction::initialize_mint2(&token_program, &mint.pubkey(), &admin, None, DECIMALS).unwrap()
    };
    let admin_kp = c.admin.insecure_clone();
    send(c, &[create, init], &[&admin_kp, &mint]).expect("create mint");
    mint.pubkey()
}

/// Create a fresh SPL Token mint (6 decimals, admin authority).
pub fn create_spl_mint(c: &mut Ctx) -> Pubkey { create_mint(c, TOKEN_PROGRAM) }

/// Create a fresh Token-2022 mint (6 decimals, admin authority, no extensions).
pub fn create_token2022_mint(c: &mut Ctx) -> Pubkey { create_mint(c, TOKEN_2022_PROGRAM) }

/// Create (idempotently) `owner`'s ATA for `mint`, paid by admin. Returns the ATA.
pub fn create_ata(c: &mut Ctx, owner: Pubkey, mint: Pubkey) -> Pubkey {
    let tp = c.token_program_of(mint);
    let admin = c.admin.insecure_clone();
    let ix = create_associated_token_account_idempotent(&admin.pubkey(), &owner, &mint, &tp);
    send(c, &[ix], &[&admin]).expect("create ata");
    ata(owner, mint, tp)
}

/// Mint `amount` base units of `mint` to `owner`'s ATA (created if needed). Admin is authority.
pub fn mint_to(c: &mut Ctx, mint: Pubkey, owner: Pubkey, amount: u64) -> TxResult {
    let tp = c.token_program_of(mint);
    let dest = create_ata(c, owner, mint);
    let admin = c.admin.insecure_clone();
    let ix = if tp == TOKEN_2022_PROGRAM {
        spl_token_2022::instruction::mint_to(&tp, &mint, &dest, &admin.pubkey(), &[], amount).unwrap()
    } else {
        spl_token::instruction::mint_to(&tp, &mint, &dest, &admin.pubkey(), &[], amount).unwrap()
    };
    send(c, &[ix], &[&admin])
}

// ---------------------------------------------------------------------------------------------
// Admin instruction builders / wrappers
// ---------------------------------------------------------------------------------------------

/// Build a parity instruction from an Anchor accounts struct and instruction data.
pub fn ix<A: ToAccountMetas, D: InstructionData>(accounts: A, data: D) -> Instruction {
    Instruction { program_id: PROGRAM_ID, accounts: accounts.to_account_metas(None), data: data.data() }
}

/// Send one instruction signed (and paid) by admin.
pub fn send_admin(c: &mut Ctx, i: Instruction) -> TxResult {
    let admin = c.admin.insecure_clone();
    send(c, &[i], &[&admin])
}

/// `initialize` instruction. `admin` must be the program upgrade authority (setup() makes the
/// harness admin the upgrade authority).
pub fn initialize_ix(admin: Pubkey, usdc: Pubkey, usdg: Pubkey, params: RiskParams) -> Instruction {
    ix(
        parity::accounts::Initialize {
            admin,
            program: PROGRAM_ID,
            program_data: program_data_pda(),
            config: config_pda(),
            demo_state: demo_pda(),
            usdc_mint: usdc,
            usdg_mint: usdg,
            system_program: SYSTEM_PROGRAM,
        },
        parity::instruction::Initialize { params },
    )
}

pub fn initialize(c: &mut Ctx, params: RiskParams) -> TxResult {
    let i = initialize_ix(c.admin.pubkey(), c.usdc, c.usdg, params);
    send_admin(c, i)
}

pub fn init_collateral_ix(admin: Pubkey, mint: Pubkey, token_program: Pubkey) -> Instruction {
    ix(
        parity::accounts::InitCollateral {
            config: config_pda(),
            admin,
            mint,
            vault: vault_pda(mint),
            insurance: insurance_pda(mint),
            token_program,
            system_program: SYSTEM_PROGRAM,
        },
        parity::instruction::InitCollateral {},
    )
}

/// Create vault + insurance token accounts for `mint` (token program inferred from the mint).
pub fn init_collateral(c: &mut Ctx, mint: Pubkey) -> TxResult {
    let i = init_collateral_ix(c.admin.pubkey(), mint, c.token_program_of(mint));
    send_admin(c, i)
}

/// `initialize(default_params())` + `init_collateral` for USDC and USDG. Panics on failure.
pub fn init_all(c: &mut Ctx) {
    initialize(c, default_params()).expect("initialize");
    let (usdc, usdg) = (c.usdc, c.usdg);
    init_collateral(c, usdc).expect("init_collateral usdc");
    init_collateral(c, usdg).expect("init_collateral usdg");
}

pub fn set_params_ix(admin: Pubkey, params: RiskParams) -> Instruction {
    ix(parity::accounts::SetParams { config: config_pda(), admin }, parity::instruction::SetParams { params })
}

pub fn set_params(c: &mut Ctx, params: RiskParams) -> TxResult {
    let i = set_params_ix(c.admin.pubkey(), params);
    send_admin(c, i)
}

pub fn set_rate_ix(admin: Pubkey, code: [u8; 3], rate_bps: i64, basis_days: u16) -> Instruction {
    ix(
        parity::accounts::SetRate { config: config_pda(), admin, rate: rate_pda(code), system_program: SYSTEM_PROGRAM },
        parity::instruction::SetRate { code, rate_bps, basis_days },
    )
}

pub fn set_rate(c: &mut Ctx, code: [u8; 3], rate_bps: i64, basis_days: u16) -> TxResult {
    let i = set_rate_ix(c.admin.pubkey(), code, rate_bps, basis_days);
    send_admin(c, i)
}

/// `set_rate` signed (and paid) by `signer` instead of admin.
pub fn set_rate_as(c: &mut Ctx, signer: &Keypair, code: [u8; 3], rate_bps: i64, basis_days: u16) -> TxResult {
    let i = set_rate_ix(signer.pubkey(), code, rate_bps, basis_days);
    send(c, &[i], &[signer])
}

/// Market 0: USD/TRY (base USD, quote TRY), single feed, `op = None`, quote leg via InvFeedA,
/// IM 10%. Feed id is a placeholder `[1; 32]` (feed_b unused, zero).
pub fn usd_try_market_args() -> MarketArgs {
    MarketArgs {
        id: 0,
        symbol: *b"USD/TRY\0\0\0\0\0",
        base: *b"USD",
        quote: *b"TRY",
        feed_a: [1u8; 32],
        feed_b: [0u8; 32],
        op: 0,
        scale_num: 1,
        scale_den: 1,
        quote_conv: 1,
        im_bps: 1000,
        active: true,
    }
}

pub fn upsert_market_ix(admin: Pubkey, args: MarketArgs) -> Instruction {
    ix(
        parity::accounts::UpsertMarket {
            config: config_pda(),
            admin,
            market: market_pda(args.id),
            system_program: SYSTEM_PROGRAM,
        },
        parity::instruction::UpsertMarket { args },
    )
}

pub fn upsert_market(c: &mut Ctx, args: MarketArgs) -> TxResult {
    let i = upsert_market_ix(c.admin.pubkey(), args);
    send_admin(c, i)
}

pub fn set_demo_mode(c: &mut Ctx, on: bool) -> TxResult {
    let i = ix(
        parity::accounts::SetDemoMode { config: config_pda(), admin: c.admin.pubkey(), demo_state: demo_pda() },
        parity::instruction::SetDemoMode { on },
    );
    send_admin(c, i)
}

pub fn set_demo_price(c: &mut Ctx, market_id: u16, a: u64, b: u64, set: bool) -> TxResult {
    let i = ix(
        parity::accounts::SetDemoPrice { config: config_pda(), admin: c.admin.pubkey(), demo_state: demo_pda() },
        parity::instruction::SetDemoPrice { market_id, a, b, set },
    );
    send_admin(c, i)
}

pub fn set_demo_clock(c: &mut Ctx, offset_secs: i64) -> TxResult {
    let i = ix(
        parity::accounts::SetDemoClock { config: config_pda(), admin: c.admin.pubkey() },
        parity::instruction::SetDemoClock { offset_secs },
    );
    send_admin(c, i)
}

/// Transfer `amount` of `mint` from admin's ATA into the insurance account.
/// (Fund admin first with `mint_to(c, mint, admin, ..)`.)
pub fn fund_insurance(c: &mut Ctx, mint: Pubkey, amount: u64) -> TxResult {
    let tp = c.token_program_of(mint);
    let admin = c.admin.pubkey();
    let i = ix(
        parity::accounts::FundInsurance {
            config: config_pda(),
            admin,
            mint,
            admin_token: ata(admin, mint, tp),
            insurance: insurance_pda(mint),
            token_program: tp,
        },
        parity::instruction::FundInsurance { amount },
    );
    send_admin(c, i)
}

// ---------------------------------------------------------------------------------------------
// Offer helpers (shared by offer/take tests)
// ---------------------------------------------------------------------------------------------

pub const CAP_100K: u64 = 100_000 * ONE;

/// `setup()` + `init_all` + USD/TRY market 0.
pub fn setup_market() -> Ctx {
    let mut c = setup();
    init_all(&mut c);
    upsert_market(&mut c, usd_try_market_args()).unwrap();
    c
}

#[derive(Clone, Copy)]
pub struct OfferArgs {
    pub nonce: u64,
    pub market_id: u16,
    pub side: Side,
    pub spread_bps: u16,
    pub min_tenor: u16,
    pub max_tenor: u16,
    pub capacity: u64,
}

pub fn default_offer() -> OfferArgs {
    OfferArgs { nonce: 1, market_id: 0, side: Side::Short, spread_bps: 20, min_tenor: 7, max_tenor: 90, capacity: CAP_100K }
}

pub fn create_offer_ix(c: &Ctx, maker: Pubkey, mint: Pubkey, o: OfferArgs) -> Instruction {
    let tp = c.token_program_of(mint);
    ix(
        parity::accounts::CreateOffer {
            maker,
            config: config_pda(),
            market: market_pda(o.market_id),
            mint,
            maker_ata: ata(maker, mint, tp),
            vault: vault_pda(mint),
            offer: offer_pda(maker, o.nonce),
            token_program: tp,
            system_program: SYSTEM_PROGRAM,
        },
        parity::instruction::CreateOffer {
            nonce: o.nonce,
            market_id: o.market_id,
            maker_side: o.side,
            spread_bps: o.spread_bps,
            min_tenor_days: o.min_tenor,
            max_tenor_days: o.max_tenor,
            capacity_usd: o.capacity,
        },
    )
}

pub fn create_offer(c: &mut Ctx, mint: Pubkey, o: OfferArgs) -> TxResult {
    let maker = c.maker.insecure_clone();
    let i = create_offer_ix(c, maker.pubkey(), mint, o);
    send(c, &[i], &[&maker])
}

pub fn cancel_offer_ix(c: &Ctx, signer: Pubkey, offer: Pubkey, mint: Pubkey, maker_ata: Pubkey) -> Instruction {
    ix(
        parity::accounts::CancelOffer {
            maker: signer,
            config: config_pda(),
            offer,
            mint,
            vault: vault_pda(mint),
            maker_ata,
            token_program: c.token_program_of(mint),
            associated_token_program: anchor_spl::associated_token::ID,
        },
        parity::instruction::CancelOffer {},
    )
}

pub fn cancel_offer(c: &mut Ctx, offer: Pubkey, mint: Pubkey) -> TxResult {
    let maker = c.maker.insecure_clone();
    let maker_ata = c.ata_of(maker.pubkey(), mint);
    let i = cancel_offer_ix(c, maker.pubkey(), offer, mint, maker_ata);
    send(c, &[i], &[&maker])
}

/// Decode the first Anchor event of type `E` from a transaction's `Program data:` logs.
pub fn event<E: anchor_lang::Event + anchor_lang::AnchorDeserialize>(meta: &litesvm::types::TransactionMetadata) -> E {
    use base64::Engine;
    for l in &meta.logs {
        if let Some(b64) = l.strip_prefix("Program data: ") {
            let bytes = base64::engine::general_purpose::STANDARD.decode(b64).unwrap();
            if bytes.starts_with(E::DISCRIMINATOR) {
                return E::deserialize(&mut &bytes[E::DISCRIMINATOR.len()..]).unwrap();
            }
        }
    }
    panic!("event not found in logs:\n{}", meta.logs.join("\n"));
}

// ---------------------------------------------------------------------------------------------
// take_offer helpers
// ---------------------------------------------------------------------------------------------

/// `take_offer` instruction for position `index` of `offer` (market, mint and rate PDAs are read
/// from the on-chain offer/market). `price_b` may repeat `price_a` for single-feed markets.
#[allow(clippy::too_many_arguments)]
pub fn take_offer_ix(
    c: &Ctx,
    taker: Pubkey,
    offer: Pubkey,
    index: u64,
    price_a: Pubkey,
    price_b: Pubkey,
    notional_usd: u64,
    tenor_days: u16,
) -> Instruction {
    let o: parity::state::MakerOffer = c.fetch(offer);
    let m: parity::state::Market = c.fetch(market_pda(o.market_id));
    let tp = c.token_program_of(o.mint);
    ix(
        parity::accounts::TakeOffer {
            taker,
            config: config_pda(),
            offer,
            market: market_pda(o.market_id),
            demo_state: demo_pda(),
            rate_base: rate_pda(m.base),
            rate_quote: rate_pda(m.quote),
            position: position_pda(offer, index),
            price_a,
            price_b,
            mint: o.mint,
            taker_ata: ata(taker, o.mint, tp),
            vault: vault_pda(o.mint),
            insurance: insurance_pda(o.mint),
            token_program: tp,
            system_program: SYSTEM_PROGRAM,
        },
        parity::instruction::TakeOffer { notional_usd, tenor_days },
    )
}

/// Taker takes the next position (index = current `position_counter`) of `offer`.
pub fn take_offer(c: &mut Ctx, offer: Pubkey, price_a: Pubkey, price_b: Pubkey, notional_usd: u64, tenor_days: u16) -> TxResult {
    let taker = c.taker.insecure_clone();
    let o: parity::state::MakerOffer = c.fetch(offer);
    let i = take_offer_ix(c, taker.pubkey(), offer, o.position_counter, price_a, price_b, notional_usd, tenor_days);
    send(c, &[i], &[&taker])
}
