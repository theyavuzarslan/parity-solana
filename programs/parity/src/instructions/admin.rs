//! Admin instructions: protocol config, rates, markets, demo controls, collateral accounts.
//! Every instruction checks `config.admin` via `has_one`; demo ixs (except `set_demo_mode`)
//! also require `config.demo_mode`.
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    errors::ParityError,
    constants::{CONV_INV_FEED_B, OP_DIV, OP_NONE},
    state::*,
};

// ----------------------------------------------------------------------------- initialize

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Must be the program's upgrade authority (prevents first-caller-wins initialization).
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ ParityError::Unauthorized)]
    pub program: Program<'info, crate::program::Parity>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ ParityError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(init, payer = admin, space = 8 + DemoState::INIT_SPACE, seeds = [b"demo"], bump)]
    pub demo_state: Account<'info, DemoState>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub usdg_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>, params: RiskParams) -> Result<()> {
    params.validate()?;
    require_keys_neq!(ctx.accounts.usdc_mint.key(), ctx.accounts.usdg_mint.key(), ParityError::InvalidMint);
    ctx.accounts.config.set_inner(Config {
        admin: ctx.accounts.admin.key(),
        usdc_mint: ctx.accounts.usdc_mint.key(),
        usdg_mint: ctx.accounts.usdg_mint.key(),
        demo_mode: false,
        demo_clock_offset: 0,
        params,
        bump: ctx.bumps.config,
    });
    ctx.accounts.demo_state.set_inner(DemoState {
        prices: [DemoPrice::default(); MAX_MARKETS as usize],
        bump: ctx.bumps.demo_state,
    });
    Ok(())
}

// ----------------------------------------------------------------------------- set_params

#[derive(Accounts)]
pub struct SetParams<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ ParityError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

pub fn handle_set_params(ctx: Context<SetParams>, params: RiskParams) -> Result<()> {
    params.validate()?;
    ctx.accounts.config.params = params;
    Ok(())
}

// ----------------------------------------------------------------------------- set_rate

#[derive(Accounts)]
#[instruction(code: [u8; 3])]
pub struct SetRate<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ ParityError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init_if_needed, payer = admin, space = 8 + Rate::INIT_SPACE, seeds = [b"rate", code.as_ref()], bump)]
    pub rate: Account<'info, Rate>,
    pub system_program: Program<'info, System>,
}

pub fn handle_set_rate(ctx: Context<SetRate>, code: [u8; 3], rate_bps: i64, basis_days: u16) -> Result<()> {
    require!(basis_days == 360 || basis_days == 365, ParityError::InvalidParams);
    let now = effective_now(&ctx.accounts.config)?;
    ctx.accounts.rate.set_inner(Rate { code, rate_bps, basis_days, updated_at: now, bump: ctx.bumps.rate });
    Ok(())
}

// ----------------------------------------------------------------------------- upsert_market

#[derive(Accounts)]
#[instruction(args: MarketArgs)]
pub struct UpsertMarket<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ ParityError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init_if_needed, payer = admin, space = 8 + Market::INIT_SPACE,
        seeds = [b"market", args.id.to_le_bytes().as_ref()], bump)]
    pub market: Account<'info, Market>,
    pub system_program: Program<'info, System>,
}

pub fn handle_upsert_market(ctx: Context<UpsertMarket>, args: MarketArgs) -> Result<()> {
    require!(args.id < MAX_MARKETS, ParityError::InvalidParams);
    require!(args.im_bps >= MIN_IM_BPS && args.im_bps <= 10_000, ParityError::InvalidParams);
    require!(args.op <= OP_DIV, ParityError::InvalidParams);
    require!(args.quote_conv <= CONV_INV_FEED_B, ParityError::InvalidParams);
    require!(args.scale_num > 0 && args.scale_den > 0, ParityError::InvalidParams);
    require!(args.feed_a != [0u8; 32], ParityError::InvalidParams);
    if args.op != OP_NONE || args.quote_conv == CONV_INV_FEED_B {
        require!(args.feed_b != [0u8; 32], ParityError::InvalidParams);
    }
    ctx.accounts.market.set_inner(Market {
        id: args.id,
        symbol: args.symbol,
        base: args.base,
        quote: args.quote,
        feed_a: args.feed_a,
        feed_b: args.feed_b,
        op: args.op,
        scale_num: args.scale_num,
        scale_den: args.scale_den,
        quote_conv: args.quote_conv,
        im_bps: args.im_bps,
        active: args.active,
        bump: ctx.bumps.market,
    });
    Ok(())
}

// ----------------------------------------------------------------------------- demo controls

#[derive(Accounts)]
pub struct SetDemoMode<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ ParityError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"demo"], bump = demo_state.bump)]
    pub demo_state: Account<'info, DemoState>,
}

pub fn handle_set_demo_mode(ctx: Context<SetDemoMode>, on: bool) -> Result<()> {
    ctx.accounts.config.demo_mode = on;
    if !on {
        // Leaving demo mode wipes all demo overrides so re-enabling starts clean.
        ctx.accounts.config.demo_clock_offset = 0;
        for p in ctx.accounts.demo_state.prices.iter_mut() {
            p.set = false;
        }
    }
    Ok(())
}

#[derive(Accounts)]
pub struct SetDemoPrice<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ ParityError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"demo"], bump = demo_state.bump)]
    pub demo_state: Account<'info, DemoState>,
}

pub fn handle_set_demo_price(ctx: Context<SetDemoPrice>, market_id: u16, a: u64, b: u64, set: bool) -> Result<()> {
    require!(ctx.accounts.config.demo_mode, ParityError::DemoModeOff);
    require!(market_id < MAX_MARKETS, ParityError::InvalidMarket);
    ctx.accounts.demo_state.prices[market_id as usize] = DemoPrice { a, b, set };
    Ok(())
}

#[derive(Accounts)]
pub struct SetDemoClock<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ ParityError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

pub fn handle_set_demo_clock(ctx: Context<SetDemoClock>, offset_secs: i64) -> Result<()> {
    require!(ctx.accounts.config.demo_mode, ParityError::DemoModeOff);
    require!(offset_secs >= 0, ParityError::InvalidParams);
    ctx.accounts.config.demo_clock_offset = offset_secs;
    Ok(())
}

// ----------------------------------------------------------------------------- collateral

#[derive(Accounts)]
pub struct InitCollateral<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ ParityError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mint::token_program = token_program,
        constraint = config.is_allowed_mint(&mint.key()) @ ParityError::InvalidMint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = admin, seeds = [b"vault", mint.key().as_ref()], bump,
        token::mint = mint, token::authority = config, token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(init, payer = admin, seeds = [b"insurance", mint.key().as_ref()], bump,
        token::mint = mint, token::authority = config, token::token_program = token_program)]
    pub insurance: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_collateral(_ctx: Context<InitCollateral>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct FundInsurance<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin @ ParityError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(
        mint::token_program = token_program,
        constraint = config.is_allowed_mint(&mint.key()) @ ParityError::InvalidMint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = admin, token::token_program = token_program)]
    pub admin_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [b"insurance", mint.key().as_ref()], bump,
        token::mint = mint, token::token_program = token_program)]
    pub insurance: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_fund_insurance(ctx: Context<FundInsurance>, amount: u64) -> Result<()> {
    require!(amount > 0, ParityError::InvalidParams);
    let a = &ctx.accounts;
    token_interface::transfer_checked(
        CpiContext::new(
            a.token_program.key(),
            TransferChecked {
                from: a.admin_token.to_account_info(),
                mint: a.mint.to_account_info(),
                to: a.insurance.to_account_info(),
                authority: a.admin.to_account_info(),
            },
        ),
        amount,
        a.mint.decimals,
    )
}
