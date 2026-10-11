use anchor_lang::prelude::*;

declare_id!("55jabap7VG6LKKJtidxVRBuLaLzFz6P96uPUicR2e4EQ");

pub mod constants;
pub mod math;

#[program]
pub mod parity {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
