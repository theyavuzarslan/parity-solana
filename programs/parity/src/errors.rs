use anchor_lang::prelude::*;

#[error_code]
pub enum ParityError {
    #[msg("Signer is not the config admin")]
    Unauthorized,
    #[msg("Demo mode is off")]
    DemoModeOff,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Invalid market")]
    InvalidMarket,
    #[msg("Market is inactive")]
    MarketInactive,
    #[msg("Mint is not an allowed collateral mint")]
    InvalidMint,
    #[msg("Price account feed id or verification level mismatch")]
    WrongFeed,
    #[msg("Account is not a Pyth price update")]
    NotPythAccount,
    #[msg("Market closed or price stale")]
    MarketClosedOrStale,
    #[msg("Oracle confidence interval too wide")]
    OracleConfidence,
    #[msg("Price publish time not newer than last mark")]
    StalePublishTime,
    #[msg("Invalid tenor")]
    InvalidTenor,
    #[msg("Notional below minimum")]
    BelowMinNotional,
    #[msg("Insufficient offer capacity")]
    InsufficientCapacity,
    #[msg("Offer is inactive")]
    OfferInactive,
    #[msg("Position is not liquidatable")]
    NotLiquidatable,
    #[msg("Liquidation not confirmed by enough marks")]
    NotConfirmed,
    #[msg("Position has not matured")]
    NotMatured,
    #[msg("Position is closed")]
    PositionClosed,
    #[msg("Invalid parameters")]
    InvalidParams,
    #[msg("Margin too low")]
    MarginTooLow,
}
