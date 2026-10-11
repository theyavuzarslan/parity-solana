//! Risk instructions.
//!
//! - `mark()` (permissionless): re-prices a position from a fresh oracle read, updates its status
//!   (Open/Called; PartiallyLiquidated is never downgraded) and the liquidation breach counter.
//! - `add_margin(side, amount)`: the owner of a side tops up that side's margin. It does NOT
//!   change status itself; the next `mark` re-evaluates equity and may restore `Open`.
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    errors::ParityError,
    math::{forward, pnl_long_usd},
    oracle::{self, PriceRead},
    state::{effective_now, last_publish_floor, Config, DemoState, Market, Position, Rate, Side, Status},
    waterfall::loser_equity,
};

#[event]
pub struct Marked {
    pub position: Pubkey,
    pub pnl_long: i128,
    pub loser_equity: i128,
    pub status: Status,
    pub breach_count: u8,
}

#[event]
pub struct MarginAdded {
    pub position: Pubkey,
    pub side: Side,
    pub amount: u64,
    /// The side's margin after the top-up.
    pub margin: u64,
}

/// Mark-to-market evaluation (shared with liquidation/settlement).
///
/// τ = max(maturity − now, 0); `F_t = forward(spot, r_b, r_q, τ)`;
/// `pnl_long = pnl_long_usd(qty, F_t, strike, upq, r_q, τ)` (short PnL = −long).
/// The loser is the side with negative PnL; on exactly zero PnL the loser is `Short` with
/// equity = `margin_short`. Returns `(pnl_long, loser, loser_equity)`.
pub fn evaluate(
    position: &Position,
    market: &Market,
    rb: &Rate,
    rq: &Rate,
    px: &PriceRead,
    now: i64,
) -> Result<(i128, Side, i128)> {
    let overflow = || error!(ParityError::MathOverflow);
    require!(market.id == position.market_id, ParityError::InvalidMarket);
    let tau = position.maturity.checked_sub(now).ok_or_else(overflow)?.max(0);
    let f = forward(px.spot, rb.rate_bps, rb.basis_days, rq.rate_bps, rq.basis_days, tau).ok_or_else(overflow)?;
    let pnl_long =
        pnl_long_usd(position.qty, f, position.strike, px.upq, rq.rate_bps, rq.basis_days, tau).ok_or_else(overflow)?;
    let (loser, equity) = if pnl_long < 0 {
        (Side::Long, loser_equity(position.margin_long, pnl_long))
    } else {
        (Side::Short, loser_equity(position.margin_short, pnl_long.checked_neg().ok_or_else(overflow)?))
    };
    Ok((pnl_long, loser, equity))
}

/// `equity < bps/1e4 × im`, cross-multiplied in i128 (equity may be negative).
pub(crate) fn below(equity: i128, im: u64, bps: u16) -> bool {
    equity.saturating_mul(10_000) < (im as i128) * (bps as i128)
}

#[derive(Accounts)]
pub struct Mark<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut,
        seeds = [b"position", position.offer.as_ref(), position.index.to_le_bytes().as_ref()],
        bump = position.bump)]
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
}

pub fn handle_mark(ctx: Context<Mark>) -> Result<()> {
    let a = &ctx.accounts;
    let config = &a.config;
    let params = &config.params;
    let pos = &a.position;
    require!(
        matches!(pos.status, Status::Open | Status::Called | Status::PartiallyLiquidated),
        ParityError::PositionClosed
    );
    // Marks continue on an inactive market: risk management must not pause with new business.
    let now = effective_now(config)?;
    let px = oracle::read_market_price(
        config,
        &a.market,
        &a.demo_state,
        &a.price_a.to_account_info(),
        &a.price_b.to_account_info(),
        now,
    )?;
    require!(px.publish_time > last_publish_floor(pos.last_publish_time, now), ParityError::StalePublishTime);
    let (pnl_long, _loser, equity) = evaluate(pos, &a.market, &a.rate_base, &a.rate_quote, &px, now)?;
    let im = pos.im_per_side;
    let below_call = below(equity, im, params.call_equity_bps);
    let below_liq = below(equity, im, params.liq_equity_bps);
    let gap = params.liq_confirm_min_gap_secs;

    let position_key = ctx.accounts.position.key();
    let pos = &mut ctx.accounts.position;
    if pos.status != Status::PartiallyLiquidated {
        pos.status = if below_call { Status::Called } else { Status::Open };
    }
    if below_liq {
        let since = now.saturating_sub(pos.last_breach_time);
        if since >= gap {
            pos.breach_count = pos.breach_count.saturating_add(1);
            pos.last_breach_time = now;
        }
    } else {
        pos.breach_count = 0;
        pos.last_breach_time = 0;
    }
    pos.last_publish_time = px.publish_time;

    emit!(Marked {
        position: position_key,
        pnl_long,
        loser_equity: equity,
        status: pos.status,
        breach_count: pos.breach_count,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AddMargin<'info> {
    pub owner: Signer<'info>,
    #[account(mut,
        seeds = [b"position", position.offer.as_ref(), position.index.to_le_bytes().as_ref()],
        bump = position.bump,
        has_one = mint @ ParityError::InvalidMint)]
    pub position: Box<Account<'info, Position>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub owner_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, seeds = [b"vault", mint.key().as_ref()], bump,
        token::mint = mint, token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Top up `side`'s margin. Status is left unchanged; the next `mark` re-evaluates it.
pub fn handle_add_margin(ctx: Context<AddMargin>, side: Side, amount: u64) -> Result<()> {
    let a = &ctx.accounts;
    let pos = &a.position;
    require!(amount > 0, ParityError::InvalidParams);
    require!(
        !matches!(pos.status, Status::Settled | Status::Liquidated),
        ParityError::PositionClosed
    );
    let side_owner = match side {
        Side::Long => pos.long,
        Side::Short => pos.short,
    };
    require_keys_eq!(a.owner.key(), side_owner, ParityError::Unauthorized);

    token_interface::transfer_checked(
        CpiContext::new(
            a.token_program.key(),
            TransferChecked {
                from: a.owner_token.to_account_info(),
                mint: a.mint.to_account_info(),
                to: a.vault.to_account_info(),
                authority: a.owner.to_account_info(),
            },
        ),
        amount,
        a.mint.decimals,
    )?;

    let position_key = ctx.accounts.position.key();
    let pos = &mut ctx.accounts.position;
    let margin = match side {
        Side::Long => &mut pos.margin_long,
        Side::Short => &mut pos.margin_short,
    };
    *margin = margin.checked_add(amount).ok_or_else(|| error!(ParityError::MathOverflow))?;
    emit!(MarginAdded { position: position_key, side, amount, margin: *margin });
    Ok(())
}
