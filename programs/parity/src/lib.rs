use anchor_lang::prelude::*;

declare_id!("55jabap7VG6LKKJtidxVRBuLaLzFz6P96uPUicR2e4EQ");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod math;
pub mod state;

pub use instructions::*;
use state::{MarketArgs, RiskParams};

#[program]
pub mod parity {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: RiskParams) -> Result<()> {
        instructions::admin::handle_initialize(ctx, params)
    }

    pub fn set_params(ctx: Context<SetParams>, params: RiskParams) -> Result<()> {
        instructions::admin::handle_set_params(ctx, params)
    }

    pub fn set_rate(ctx: Context<SetRate>, code: [u8; 3], rate_bps: i64, basis_days: u16) -> Result<()> {
        instructions::admin::handle_set_rate(ctx, code, rate_bps, basis_days)
    }

    pub fn upsert_market(ctx: Context<UpsertMarket>, args: MarketArgs) -> Result<()> {
        instructions::admin::handle_upsert_market(ctx, args)
    }

    pub fn set_demo_mode(ctx: Context<SetDemoMode>, on: bool) -> Result<()> {
        instructions::admin::handle_set_demo_mode(ctx, on)
    }

    pub fn set_demo_price(ctx: Context<SetDemoPrice>, market_id: u16, a: u64, b: u64, set: bool) -> Result<()> {
        instructions::admin::handle_set_demo_price(ctx, market_id, a, b, set)
    }

    pub fn set_demo_clock(ctx: Context<SetDemoClock>, offset_secs: i64) -> Result<()> {
        instructions::admin::handle_set_demo_clock(ctx, offset_secs)
    }

    pub fn init_collateral(ctx: Context<InitCollateral>) -> Result<()> {
        instructions::admin::handle_init_collateral(ctx)
    }

    pub fn fund_insurance(ctx: Context<FundInsurance>, amount: u64) -> Result<()> {
        instructions::admin::handle_fund_insurance(ctx, amount)
    }
}
