//! Closing instructions.
//!
//! - `liquidate()` (any signer): after `liq_confirm_marks` confirmed breaches and with equity
//!   still below the liquidation threshold at a fresh price, closes `partial_liq_bps` of the
//!   position (realised PnL through the loss waterfall, penalty on the closed notional split
//!   between the caller and insurance). If the reduced position is still below the threshold, or
//!   the position was already partially liquidated, it is closed fully and paid out.
//! - `settle()` (anyone): at or after maturity, closes the position at spot (τ = 0) through the
//!   loss waterfall without a penalty and pays both sides out.
//!
//! Loss waterfall: loser margin → insurance fund (same mint) → haircut on the winner (shortfall).
//! Payouts only ever go to token accounts (of the position's mint) owned by `position.long` /
//! `position.short`. Any such account is accepted, not just the canonical ATA, so a party cannot
//! block settlement by reassigning its ATA's owner; Token-2022 payout accounts with
//! RequiredMemoTransfers or CpiGuard enabled are rejected (`PayoutAccountUnsupported`) and the
//! caller passes a fresh plain account owned by that party instead.
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::spl_token_2022::{
        self,
        extension::{cpi_guard::CpiGuard, memo_transfer::MemoTransfer, BaseStateWithExtensions, StateWithExtensions},
    },
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    errors::ParityError,
    instructions::risk::{below, evaluate},
    math::{bps_of, BPS},
    oracle::{self, PriceRead},
    state::{effective_now, last_publish_floor, Config, DemoState, Market, Position, Rate, Side, Status},
    waterfall::{allocate_loss, Allocation},
};

#[event]
pub struct PartiallyLiquidated {
    pub position: Pubkey,
    /// PnL realised on the closed fraction (owed by the loser).
    pub realized: u64,
    pub from_insurance: u64,
    pub shortfall: u64,
    pub penalty: u64,
    pub reward: u64,
    pub remaining_qty: u64,
}

#[event]
pub struct Liquidated {
    pub position: Pubkey,
    /// Long PnL of the (remaining) position at the liquidation price.
    pub pnl_long: i128,
    pub from_loser: u64,
    pub from_insurance: u64,
    pub shortfall: u64,
    pub penalty: u64,
    pub reward: u64,
}

#[event]
pub struct Settled {
    pub position: Pubkey,
    pub pnl_long: i128,
    pub from_loser: u64,
    pub from_insurance: u64,
    pub shortfall: u64,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut,
        seeds = [b"position", position.offer.as_ref(), position.index.to_le_bytes().as_ref()],
        bump = position.bump,
        has_one = mint @ ParityError::InvalidMint)]
    pub position: Box<Account<'info, Position>>,
    #[account(seeds = [b"market", position.market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(seeds = [b"rate", market.base.as_ref()], bump = rate_base.bump)]
    pub rate_base: Box<Account<'info, Rate>>,
    #[account(seeds = [b"rate", market.quote.as_ref()], bump = rate_quote.bump)]
    pub rate_quote: Box<Account<'info, Rate>>,
    #[account(seeds = [b"demo"], bump = demo_state.bump)]
    pub demo_state: Box<Account<'info, DemoState>>,
    /// CHECK: validated by `oracle::read_market_price` (owner, discriminator, feed id, staleness).
    pub price_a: UncheckedAccount<'info>,
    /// CHECK: validated by `oracle::read_market_price` when the market uses feed B; else ignored.
    pub price_b: UncheckedAccount<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, seeds = [b"vault", mint.key().as_ref()], bump,
        token::mint = mint, token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, seeds = [b"insurance", mint.key().as_ref()], bump,
        token::mint = mint, token::token_program = token_program)]
    pub insurance: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Receives the liquidator reward.
    #[account(mut, token::mint = mint, token::authority = caller, token::token_program = token_program)]
    pub caller_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Any token account of `mint` owned by `position.long` (receives the long side's payout).
    #[account(mut, token::mint = mint, token::authority = position.long, token::token_program = token_program)]
    pub long_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Any token account of `mint` owned by `position.short` (receives the short side's payout).
    #[account(mut, token::mint = mint, token::authority = position.short, token::token_program = token_program)]
    pub short_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut,
        seeds = [b"position", position.offer.as_ref(), position.index.to_le_bytes().as_ref()],
        bump = position.bump,
        has_one = mint @ ParityError::InvalidMint)]
    pub position: Box<Account<'info, Position>>,
    #[account(seeds = [b"market", position.market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(seeds = [b"rate", market.base.as_ref()], bump = rate_base.bump)]
    pub rate_base: Box<Account<'info, Rate>>,
    #[account(seeds = [b"rate", market.quote.as_ref()], bump = rate_quote.bump)]
    pub rate_quote: Box<Account<'info, Rate>>,
    #[account(seeds = [b"demo"], bump = demo_state.bump)]
    pub demo_state: Box<Account<'info, DemoState>>,
    /// CHECK: validated by `oracle::read_market_price` (owner, discriminator, feed id, staleness).
    pub price_a: UncheckedAccount<'info>,
    /// CHECK: validated by `oracle::read_market_price` when the market uses feed B; else ignored.
    pub price_b: UncheckedAccount<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, seeds = [b"vault", mint.key().as_ref()], bump,
        token::mint = mint, token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, seeds = [b"insurance", mint.key().as_ref()], bump,
        token::mint = mint, token::token_program = token_program)]
    pub insurance: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Any token account of `mint` owned by `position.long` (receives the long side's payout).
    #[account(mut, token::mint = mint, token::authority = position.long, token::token_program = token_program)]
    pub long_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Any token account of `mint` owned by `position.short` (receives the short side's payout).
    #[account(mut, token::mint = mint, token::authority = position.short, token::token_program = token_program)]
    pub short_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

// ---------------------------------------------------------------------------------------------
// Pure accounting (no CPIs): computed first, transfers executed afterwards.
// ---------------------------------------------------------------------------------------------

fn overflow() -> Error {
    error!(ParityError::MathOverflow)
}

/// `|pnl|` as a token amount, saturating at `u64::MAX` (the excess becomes shortfall).
fn owed(pnl_long: i128) -> u64 {
    u64::try_from(pnl_long.unsigned_abs()).unwrap_or(u64::MAX)
}

/// `amount × num / BPS`, floor.
fn scale(amount: u64, num: u64) -> u64 {
    // num <= BPS so the result never exceeds `amount`.
    ((amount as u128 * num as u128) / BPS as u128) as u64
}

fn margins_mut(pos: &mut Position, loser: Side) -> (&mut u64, &mut u64) {
    match loser {
        Side::Long => (&mut pos.margin_long, &mut pos.margin_short),
        Side::Short => (&mut pos.margin_short, &mut pos.margin_long),
    }
}

/// Penalty on `closed_notional` capped by the loser's remaining margin, and the caller's share.
fn penalty_split(closed_notional: u64, loser_margin: u64, params_penalty_bps: u16, reward_bps: u16) -> (u64, u64) {
    let penalty = bps_of(closed_notional, params_penalty_bps).min(loser_margin);
    (penalty, bps_of(penalty, reward_bps))
}

/// Result of closing a position fully: amounts to pay out of the vault and insurance.
struct FullClose {
    alloc: Allocation,
    penalty: u64,
    reward: u64,
    /// vault → winner ATA (winner margin + `from_loser`).
    winner_from_vault: u64,
    /// vault → loser ATA (loser margin left after the loss and penalty).
    loser_from_vault: u64,
}

/// Close `pos` fully at `pnl_long`: loss waterfall, optional penalty on the remaining notional,
/// then zero both margins. `insurance` is the fund balance available for the waterfall.
fn full_close(
    pos: &mut Position,
    pnl_long: i128,
    loser: Side,
    insurance: u64,
    penalty_bps: Option<(u16, u16)>,
) -> Result<FullClose> {
    let notional = pos.notional_usd;
    let (loser_margin, winner_margin) = margins_mut(pos, loser);
    let alloc = allocate_loss(owed(pnl_long), *loser_margin, insurance);
    let left = *loser_margin - alloc.from_loser;
    let (penalty, reward) = match penalty_bps {
        Some((p, r)) => penalty_split(notional, left, p, r),
        None => (0, 0),
    };
    let out = FullClose {
        alloc,
        penalty,
        reward,
        winner_from_vault: winner_margin.checked_add(alloc.from_loser).ok_or_else(overflow)?,
        loser_from_vault: left - penalty,
    };
    *loser_margin = 0;
    *winner_margin = 0;
    Ok(out)
}

// ---------------------------------------------------------------------------------------------
// Token movements
// ---------------------------------------------------------------------------------------------

struct Payer<'a, 'info> {
    token_program: &'a Interface<'info, TokenInterface>,
    mint: &'a InterfaceAccount<'info, Mint>,
    config: &'a Account<'info, Config>,
}

impl<'info> Payer<'_, 'info> {
    /// Program-signed transfer from the vault or insurance account; zero amounts are skipped.
    fn pay(&self, from: &InterfaceAccount<'info, TokenAccount>, to: &InterfaceAccount<'info, TokenAccount>, amount: u64) -> Result<()> {
        if amount == 0 {
            return Ok(());
        }
        let seeds: &[&[u8]] = &[b"config", &[self.config.bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.key(),
                TransferChecked {
                    from: from.to_account_info(),
                    mint: self.mint.to_account_info(),
                    to: to.to_account_info(),
                    authority: self.config.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            self.mint.decimals,
        )
    }
}

/// Rejects a Token-2022 payout account that has RequiredMemoTransfers or CpiGuard enabled
/// (an incoming program transfer without a memo would fail, blocking the close).
fn check_payout_account(acc: &AccountInfo) -> Result<()> {
    if *acc.owner != spl_token_2022::ID {
        return Ok(());
    }
    let data = acc.try_borrow_data()?;
    let state = StateWithExtensions::<spl_token_2022::state::Account>::unpack(&data)
        .map_err(|_| error!(ParityError::PayoutAccountUnsupported))?;
    if let Ok(memo) = state.get_extension::<MemoTransfer>() {
        require!(!bool::from(memo.require_incoming_transfer_memos), ParityError::PayoutAccountUnsupported);
    }
    if let Ok(guard) = state.get_extension::<CpiGuard>() {
        require!(!bool::from(guard.lock_cpi), ParityError::PayoutAccountUnsupported);
    }
    Ok(())
}

/// Shared entry checks: open position, fresh-enough price (`publish_time >= last`, a future
/// `last_publish_time` counts as 0), returns `(now, price)`.
fn read_price(
    config: &Config,
    pos: &Position,
    market: &Market,
    demo: &DemoState,
    price_a: &AccountInfo,
    price_b: &AccountInfo,
) -> Result<(i64, PriceRead)> {
    require!(
        matches!(pos.status, Status::Open | Status::Called | Status::PartiallyLiquidated),
        ParityError::PositionClosed
    );
    let now = effective_now(config)?;
    let px = oracle::read_market_price(config, market, demo, price_a, price_b, now)?;
    require!(px.publish_time >= last_publish_floor(pos.last_publish_time, now), ParityError::StalePublishTime);
    Ok((now, px))
}

pub fn handle_liquidate(ctx: Context<Liquidate>) -> Result<()> {
    let a = &ctx.accounts;
    let params = a.config.params;
    let mut pos: Position = Position::clone(&a.position);
    require!(
        matches!(pos.status, Status::Open | Status::Called | Status::PartiallyLiquidated),
        ParityError::PositionClosed
    );
    require!(pos.breach_count >= params.liq_confirm_marks, ParityError::NotConfirmed);
    // At or after maturity the position is settled, not liquidated.
    require!(effective_now(&a.config)? < pos.maturity, ParityError::NotLiquidatable);
    check_payout_account(&a.long_ata.to_account_info())?;
    check_payout_account(&a.short_ata.to_account_info())?;
    let (now, px) = read_price(
        &a.config,
        &pos,
        &a.market,
        &a.demo_state,
        &a.price_a.to_account_info(),
        &a.price_b.to_account_info(),
    )?;
    let (mut pnl_long, mut loser, equity) = evaluate(&pos, &a.market, &a.rate_base, &a.rate_quote, &px, now)?;
    require!(below(equity, pos.im_per_side, params.liq_equity_bps), ParityError::NotLiquidatable);

    let position_key = a.position.key();
    let payer = Payer { token_program: &a.token_program, mint: &a.mint, config: &a.config };
    let mut insurance = a.insurance.amount;
    let mut full = pos.status == Status::PartiallyLiquidated;

    if !full {
        // Partial: realise `frac` of the PnL through the waterfall and shrink the position.
        let frac = params.partial_liq_bps as u64;
        let realized = scale(owed(pnl_long), frac);
        let closed_notional = scale(pos.notional_usd, frac);
        let (loser_margin, winner_margin) = margins_mut(&mut pos, loser);
        let alloc = allocate_loss(realized, *loser_margin, insurance);
        *loser_margin -= alloc.from_loser;
        let (penalty, reward) =
            penalty_split(closed_notional, *loser_margin, params.liq_penalty_bps, params.liquidator_reward_bps);
        *loser_margin -= penalty;
        *winner_margin = winner_margin
            .checked_add(alloc.from_loser)
            .and_then(|m| m.checked_add(alloc.from_insurance))
            .ok_or_else(overflow)?;
        let keep = BPS as u64 - frac;
        pos.qty = scale(pos.qty, keep);
        pos.notional_usd = scale(pos.notional_usd, keep);
        pos.im_per_side = scale(pos.im_per_side, keep);
        pos.status = Status::PartiallyLiquidated;
        pos.breach_count = 0;
        pos.last_breach_time = 0;

        // Insurance covers the part the loser could not; the penalty is split caller/insurance.
        payer.pay(&a.insurance, &a.vault, alloc.from_insurance)?;
        payer.pay(&a.vault, &a.caller_ata, reward)?;
        payer.pay(&a.vault, &a.insurance, penalty - reward)?;
        insurance = insurance - alloc.from_insurance + (penalty - reward);

        emit!(PartiallyLiquidated {
            position: position_key,
            realized,
            from_insurance: alloc.from_insurance,
            shortfall: alloc.shortfall,
            penalty,
            reward,
            remaining_qty: pos.qty,
        });

        // Re-evaluate the reduced position at the same price (same strike, reduced qty).
        let (pnl2, loser2, equity2) = evaluate(&pos, &a.market, &a.rate_base, &a.rate_quote, &px, now)?;
        if pos.qty == 0 || below(equity2, pos.im_per_side, params.liq_equity_bps) {
            full = true;
            pnl_long = pnl2;
            loser = loser2;
        }
    }

    if full {
        let close = full_close(
            &mut pos,
            pnl_long,
            loser,
            insurance,
            Some((params.liq_penalty_bps, params.liquidator_reward_bps)),
        )?;
        let (winner_ata, loser_ata) = match loser {
            Side::Long => (&a.short_ata, &a.long_ata),
            Side::Short => (&a.long_ata, &a.short_ata),
        };
        payer.pay(&a.vault, winner_ata, close.winner_from_vault)?;
        payer.pay(&a.insurance, winner_ata, close.alloc.from_insurance)?;
        payer.pay(&a.vault, loser_ata, close.loser_from_vault)?;
        payer.pay(&a.vault, &a.caller_ata, close.reward)?;
        payer.pay(&a.vault, &a.insurance, close.penalty - close.reward)?;
        pos.status = Status::Liquidated;
        emit!(Liquidated {
            position: position_key,
            pnl_long,
            from_loser: close.alloc.from_loser,
            from_insurance: close.alloc.from_insurance,
            shortfall: close.alloc.shortfall,
            penalty: close.penalty,
            reward: close.reward,
        });
    }

    pos.last_publish_time = px.publish_time;
    let stored: &mut Position = &mut ctx.accounts.position;
    *stored = pos;
    Ok(())
}

pub fn handle_settle(ctx: Context<Settle>) -> Result<()> {
    let a = &ctx.accounts;
    let mut pos: Position = Position::clone(&a.position);
    require!(
        matches!(pos.status, Status::Open | Status::Called | Status::PartiallyLiquidated),
        ParityError::PositionClosed
    );
    // Maturity before the oracle read, so an early call reports NotMatured even when the market
    // is closed or the price is stale.
    require!(effective_now(&a.config)? >= pos.maturity, ParityError::NotMatured);
    check_payout_account(&a.long_ata.to_account_info())?;
    check_payout_account(&a.short_ata.to_account_info())?;
    let (now, px) = read_price(
        &a.config,
        &pos,
        &a.market,
        &a.demo_state,
        &a.price_a.to_account_info(),
        &a.price_b.to_account_info(),
    )?;
    // τ = max(maturity − now, 0) = 0, so the forward equals spot.
    let (pnl_long, loser, _equity) = evaluate(&pos, &a.market, &a.rate_base, &a.rate_quote, &px, now)?;
    let close = full_close(&mut pos, pnl_long, loser, a.insurance.amount, None)?;

    let payer = Payer { token_program: &a.token_program, mint: &a.mint, config: &a.config };
    let (winner_ata, loser_ata) = match loser {
        Side::Long => (&a.short_ata, &a.long_ata),
        Side::Short => (&a.long_ata, &a.short_ata),
    };
    payer.pay(&a.vault, winner_ata, close.winner_from_vault)?;
    payer.pay(&a.insurance, winner_ata, close.alloc.from_insurance)?;
    payer.pay(&a.vault, loser_ata, close.loser_from_vault)?;

    pos.status = Status::Settled;
    pos.last_publish_time = px.publish_time;
    let position_key = a.position.key();
    emit!(Settled {
        position: position_key,
        pnl_long,
        from_loser: close.alloc.from_loser,
        from_insurance: close.alloc.from_insurance,
        shortfall: close.alloc.shortfall,
    });
    let stored: &mut Position = &mut ctx.accounts.position;
    *stored = pos;
    Ok(())
}
