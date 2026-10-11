//! Shared constants. Pricing constants live in `math` and are re-exported here.
pub use crate::math::{BPS, PRICE_SCALE, SECS_PER_DAY};

/// `Market.op` codes (see `math::compose_spot`).
pub const OP_NONE: u8 = 0;
pub const OP_MUL: u8 = 1;
pub const OP_DIV: u8 = 2;
/// `Market.quote_conv` codes (see `math::usd_per_quote`).
pub const CONV_USD: u8 = 0;
pub const CONV_INV_FEED_A: u8 = 1;
pub const CONV_INV_FEED_B: u8 = 2;
