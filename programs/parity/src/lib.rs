use anchor_lang::prelude::*;

declare_id!("55jabap7VG6LKKJtidxVRBuLaLzFz6P96uPUicR2e4EQ");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod math;
pub mod oracle;
pub mod state;

pub use instructions::*;
use state::{MarketArgs, RiskParams, Side};

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

    /// Permissionless view: read a market price (demo override or Pyth) and emit `PriceRead`.
    pub fn debug_price(ctx: Context<DebugPrice>, market_id: u16) -> Result<()> {
        instructions::oracle_view::handle_debug_price(ctx, market_id)
    }

    /// Maker posts an offer and locks IM plus the protocol's spread share on full capacity.
    #[allow(clippy::too_many_arguments)]
    pub fn create_offer(
        ctx: Context<CreateOffer>,
        nonce: u64,
        market_id: u16,
        maker_side: Side,
        spread_bps: u16,
        min_tenor_days: u16,
        max_tenor_days: u16,
        capacity_usd: u64,
    ) -> Result<()> {
        instructions::offer::handle_create_offer(
            ctx, nonce, market_id, maker_side, spread_bps, min_tenor_days, max_tenor_days, capacity_usd,
        )
    }

    /// Maker deactivates an offer; its locked margin returns to the maker's canonical ATA.
    pub fn cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
        instructions::offer::handle_cancel_offer(ctx)
    }

    /// Taker opens a margined forward position against an offer (one PDA per offer counter).
    pub fn take_offer(ctx: Context<TakeOffer>, notional_usd: u64, tenor_days: u16) -> Result<()> {
        instructions::take::handle_take_offer(ctx, notional_usd, tenor_days)
    }
}
