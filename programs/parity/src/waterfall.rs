//! Pure loss-waterfall helpers (no Anchor types): loser margin → insurance fund → haircut.

/// How an amount owed by the losing side is covered.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Allocation {
    /// Paid out of the loser's posted margin.
    pub from_loser: u64,
    /// Paid out of the insurance fund (same mint) after the loser's margin is exhausted.
    pub from_insurance: u64,
    /// Uncovered remainder; becomes a haircut on the winner's payout.
    pub shortfall: u64,
}

/// Split `owed` across the loser's margin first, then the insurance fund; the rest is shortfall.
/// Invariant: `from_loser + from_insurance + shortfall == owed`.
pub fn allocate_loss(owed: u64, loser_margin: u64, insurance: u64) -> Allocation {
    let from_loser = owed.min(loser_margin);
    let rest = owed.saturating_sub(from_loser);
    let from_insurance = rest.min(insurance);
    let shortfall = rest.saturating_sub(from_insurance);
    Allocation { from_loser, from_insurance, shortfall }
}

/// Equity of a side: posted margin plus that side's PnL (may be negative).
pub fn loser_equity(margin: u64, pnl_for_side: i128) -> i128 {
    (margin as i128).saturating_add(pnl_for_side)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn covered_by_margin() {
        let a = allocate_loss(600, 1_000, 5_000);
        assert_eq!(a, Allocation { from_loser: 600, from_insurance: 0, shortfall: 0 });
        assert_eq!(allocate_loss(1_000, 1_000, 0), Allocation { from_loser: 1_000, from_insurance: 0, shortfall: 0 });
        assert_eq!(allocate_loss(0, 1_000, 0), Allocation { from_loser: 0, from_insurance: 0, shortfall: 0 });
    }

    #[test]
    fn insurance_second() {
        let a = allocate_loss(1_500, 1_000, 5_000);
        assert_eq!(a, Allocation { from_loser: 1_000, from_insurance: 500, shortfall: 0 });
        assert_eq!(allocate_loss(1_500, 1_000, 500), Allocation { from_loser: 1_000, from_insurance: 500, shortfall: 0 });
    }

    #[test]
    fn shortfall_haircut() {
        let a = allocate_loss(2_000, 1_000, 300);
        assert_eq!(a, Allocation { from_loser: 1_000, from_insurance: 300, shortfall: 700 });
        let b = allocate_loss(u64::MAX, 0, 0);
        assert_eq!(b, Allocation { from_loser: 0, from_insurance: 0, shortfall: u64::MAX });
        let c = allocate_loss(u64::MAX, u64::MAX / 2, u64::MAX);
        assert_eq!(c.from_loser + c.from_insurance + c.shortfall, u64::MAX);
    }

    #[test]
    fn loser_equity_signs() {
        assert_eq!(loser_equity(1_000, -600), 400);
        assert_eq!(loser_equity(1_000, -1_500), -500);
        assert_eq!(loser_equity(1_000, 250), 1_250);
        assert_eq!(loser_equity(u64::MAX, i128::MAX), i128::MAX);
    }
}
