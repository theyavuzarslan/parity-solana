//! `take_offer(notional_usd, tenor_days)`: a taker opens a margined forward position against a
//! maker offer. The strike is the rate-parity forward widened by the offer spread against the
//! taker; both sides post IM. The maker's IM and protocol spread share come out of the offer's
//! locked margin; the taker pays IM to the vault and the open fee to insurance.
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    errors::ParityError,
    math::{bps_of_ceil, forward, quantity, strike, SECS_PER_DAY},
    oracle,
    state::{effective_now, Config, DemoState, MakerOffer, Market, Position, Rate, Side, Status},
};

#[event]
pub struct PositionOpened {
    pub position: Pubkey,
    pub market_id: u16,
    pub long: Pubkey,
    pub short: Pubkey,
    pub notional_usd: u64,
    pub qty: u64,
    pub strike: u64,
    pub maturity: i64,
    pub mint: Pubkey,
}

#[derive(Accounts)]
pub struct TakeOffer<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut,
        seeds = [b"offer", offer.maker.as_ref(), offer.nonce.to_le_bytes().as_ref()], bump = offer.bump,
        has_one = mint @ ParityError::InvalidMint,
        constraint = offer.maker != taker.key() @ ParityError::Unauthorized,
    )]
    pub offer: Box<Account<'info, MakerOffer>>,
    #[account(seeds = [b"market", market.id.to_le_bytes().as_ref()], bump = market.bump,
        constraint = offer.market_id == market.id @ ParityError::InvalidMarket)]
    pub market: Box<Account<'info, Market>>,
    #[account(seeds = [b"demo"], bump = demo_state.bump)]
    pub demo_state: Box<Account<'info, DemoState>>,
    #[account(seeds = [b"rate", market.base.as_ref()], bump = rate_base.bump)]
    pub rate_base: Box<Account<'info, Rate>>,
    #[account(seeds = [b"rate", market.quote.as_ref()], bump = rate_quote.bump)]
    pub rate_quote: Box<Account<'info, Rate>>,
    /// Indexed by the offer's position counter before this take.
    #[account(init, payer = taker, space = 8 + Position::INIT_SPACE,
        seeds = [b"position", offer.key().as_ref(), offer.position_counter.to_le_bytes().as_ref()], bump)]
    pub position: Box<Account<'info, Position>>,
    /// CHECK: validated by `oracle::read_market_price` (owner, discriminator, feed id, staleness).
    pub price_a: UncheckedAccount<'info>,
    /// CHECK: validated by `oracle::read_market_price` when the market uses feed B; else ignored.
    pub price_b: UncheckedAccount<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = taker, token::token_program = token_program)]
    pub taker_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, seeds = [b"vault", mint.key().as_ref()], bump,
        token::mint = mint, token::token_program = token_program)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, seeds = [b"insurance", mint.key().as_ref()], bump,
        token::mint = mint, token::token_program = token_program)]
    pub insurance: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_take_offer(ctx: Context<TakeOffer>, notional_usd: u64, tenor_days: u16) -> Result<()> {
    let overflow = || error!(ParityError::MathOverflow);
    let a = &ctx.accounts;
    let (config, market, offer) = (&a.config, &a.market, &a.offer);
    let params = &config.params;

    require!(market.active, ParityError::MarketInactive);
    let now = effective_now(config)?;
    let px = oracle::read_market_price(
        config,
        market,
        &a.demo_state,
        &a.price_a.to_account_info(),
        &a.price_b.to_account_info(),
        now,
    )?;
    require!(offer.active, ParityError::OfferInactive);
    require!(
        tenor_days >= offer.min_tenor_days && tenor_days <= offer.max_tenor_days,
        ParityError::InvalidTenor
    );
    require!(notional_usd >= params.min_notional, ParityError::BelowMinNotional);
    require!(notional_usd <= offer.capacity_usd, ParityError::InsufficientCapacity);

    let t = (tenor_days as i64).checked_mul(SECS_PER_DAY).ok_or_else(overflow)?;
    let f = forward(
        px.spot,
        a.rate_base.rate_bps,
        a.rate_base.basis_days,
        a.rate_quote.rate_bps,
        a.rate_quote.basis_days,
        t,
    )
    .ok_or_else(overflow)?;
    let taker_long = offer.maker_side == Side::Short;
    let k = strike(f, offer.spread_bps, taker_long).ok_or_else(overflow)?;
    let qty = quantity(notional_usd, px.spot, px.upq).ok_or_else(overflow)?;
    let im = bps_of_ceil(notional_usd, market.im_bps);
    let maker_fee = bps_of_ceil(bps_of_ceil(notional_usd, offer.spread_bps), params.maker_fee_share_bps);
    let open_fee = bps_of_ceil(notional_usd, params.open_fee_bps);
    let maker_cost = im.checked_add(maker_fee).ok_or_else(overflow)?;
    require!(offer.margin_locked >= maker_cost, ParityError::InsufficientCapacity);
    let maturity = now.checked_add(t).ok_or_else(overflow)?;

    let taker_key = a.taker.key();
    let (long, short) = if taker_long { (taker_key, offer.maker) } else { (offer.maker, taker_key) };
    let decimals = a.mint.decimals;

    // Taker: IM -> vault, open fee -> insurance.
    for (to, amount) in [(a.vault.to_account_info(), im), (a.insurance.to_account_info(), open_fee)] {
        if amount == 0 {
            continue;
        }
        token_interface::transfer_checked(
            CpiContext::new(
                a.token_program.key(),
                TransferChecked {
                    from: a.taker_ata.to_account_info(),
                    mint: a.mint.to_account_info(),
                    to,
                    authority: a.taker.to_account_info(),
                },
            ),
            amount,
            decimals,
        )?;
    }

    // Maker fee: vault -> insurance, out of the maker's locked margin.
    if maker_fee > 0 {
        let seeds: &[&[u8]] = &[b"config", &[config.bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                a.token_program.key(),
                TransferChecked {
                    from: a.vault.to_account_info(),
                    mint: a.mint.to_account_info(),
                    to: a.insurance.to_account_info(),
                    authority: config.to_account_info(),
                },
                &[seeds],
            ),
            maker_fee,
            decimals,
        )?;
    }

    let market_id = market.id;
    let mint = a.mint.key();
    let offer_key = a.offer.key();

    let offer = &mut ctx.accounts.offer;
    let index = offer.position_counter;
    offer.margin_locked -= maker_cost;
    offer.capacity_usd -= notional_usd;
    offer.position_counter = index.checked_add(1).ok_or_else(overflow)?;

    let position = &mut ctx.accounts.position;
    position.set_inner(Position {
        offer: offer_key,
        index,
        long,
        short,
        market_id,
        mint,
        notional_usd,
        qty,
        strike: k,
        opened_at: now,
        maturity,
        im_per_side: im,
        margin_long: im,
        margin_short: im,
        status: Status::Open,
        breach_count: 0,
        last_breach_time: 0,
        last_publish_time: px.publish_time,
        bump: ctx.bumps.position,
    });
    emit!(PositionOpened {
        position: position.key(),
        market_id,
        long,
        short,
        notional_usd,
        qty,
        strike: k,
        maturity,
        mint,
    });
    Ok(())
}
