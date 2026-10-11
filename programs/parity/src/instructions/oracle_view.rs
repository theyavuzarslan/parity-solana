//! `debug_price(market_id)`: permissionless view that reads a market price and emits `PriceRead`.
use anchor_lang::prelude::*;

use crate::{
    oracle,
    state::{effective_now, Config, DemoState, Market},
};

#[event]
pub struct PriceRead {
    pub market_id: u16,
    pub a: u64,
    pub b: u64,
    pub spot: u64,
    pub upq: u64,
    pub publish_time: i64,
}

#[derive(Accounts)]
#[instruction(market_id: u16)]
pub struct DebugPrice<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(seeds = [b"demo"], bump = demo_state.bump)]
    pub demo_state: Account<'info, DemoState>,
    /// CHECK: validated by `oracle::parse_price_update` (owner, discriminator, feed id).
    pub price_a: UncheckedAccount<'info>,
    /// CHECK: validated by `oracle::parse_price_update` when the market uses feed B; else ignored.
    pub price_b: UncheckedAccount<'info>,
}

pub fn handle_debug_price(ctx: Context<DebugPrice>, market_id: u16) -> Result<()> {
    let now = effective_now(&ctx.accounts.config)?;
    let r = oracle::read_market_price(
        &ctx.accounts.config,
        &ctx.accounts.market,
        &ctx.accounts.demo_state,
        &ctx.accounts.price_a.to_account_info(),
        &ctx.accounts.price_b.to_account_info(),
        now,
    )?;
    emit!(PriceRead { market_id, a: r.a, b: r.b, spot: r.spot, upq: r.upq, publish_time: r.publish_time });
    Ok(())
}
