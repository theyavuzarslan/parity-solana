//! Maker offers: `create_offer` locks margin for an offer's full capacity in the collateral vault;
//! `cancel_offer` deactivates it and returns the locked margin to the maker's canonical ATA.
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::spl_token_2022::{
        self,
        extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
    },
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    errors::ParityError,
    math::bps_of_ceil,
    state::*,
};

/// Longest tenor an offer may quote, in days.
pub const MAX_TENOR_DAYS: u16 = 365;
/// Widest spread an offer may quote, in bps.
pub const MAX_SPREAD_BPS: u16 = 500;

/// Token-2022 extensions that would break vault accounting or let a third party move or freeze
/// collateral (fee-on-transfer, CPI hooks, permanent delegate, frozen-by-default, soulbound).
const FORBIDDEN_MINT_EXTENSIONS: [ExtensionType; 5] = [
    ExtensionType::TransferFeeConfig,
    ExtensionType::TransferHook,
    ExtensionType::PermanentDelegate,
    ExtensionType::DefaultAccountState,
    ExtensionType::NonTransferable,
];

/// Rejects a Token-2022 mint carrying any of `FORBIDDEN_MINT_EXTENSIONS` (InvalidMint).
/// SPL Token mints have no extensions and pass.
pub fn check_mint_extensions(mint: &AccountInfo) -> Result<()> {
    if *mint.owner != spl_token_2022::ID {
        return Ok(());
    }
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&data)
        .map_err(|_| error!(ParityError::InvalidMint))?;
    let types = state.get_extension_types().map_err(|_| error!(ParityError::InvalidMint))?;
    require!(
        !types.iter().any(|t| FORBIDDEN_MINT_EXTENSIONS.contains(t)),
        ParityError::InvalidMint
    );
    Ok(())
}

/// Margin locked for an offer: IM on full capacity plus the protocol's share of the spread on it,
/// both rounded up.
pub fn offer_margin(capacity_usd: u64, im_bps: u16, spread_bps: u16, maker_fee_share_bps: u16) -> Result<u64> {
    bps_of_ceil(capacity_usd, im_bps)
        .checked_add(bps_of_ceil(bps_of_ceil(capacity_usd, spread_bps), maker_fee_share_bps))
        .ok_or_else(|| error!(ParityError::MathOverflow))
}

// ----------------------------------------------------------------------------- create_offer

#[derive(Accounts)]
#[instruction(nonce: u64, market_id: u16)]
pub struct CreateOffer<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,
    #[account(
        mint::token_program = token_program,
        constraint = config.is_allowed_mint(&mint.key()) @ ParityError::InvalidMint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = maker, token::token_program = token_program)]
    pub maker_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [b"vault", mint.key().as_ref()], bump,
        token::mint = mint, token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(init, payer = maker, space = 8 + MakerOffer::INIT_SPACE,
        seeds = [b"offer", maker.key().as_ref(), nonce.to_le_bytes().as_ref()], bump)]
    pub offer: Account<'info, MakerOffer>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn handle_create_offer(
    ctx: Context<CreateOffer>,
    nonce: u64,
    market_id: u16,
    maker_side: Side,
    spread_bps: u16,
    min_tenor_days: u16,
    max_tenor_days: u16,
    capacity_usd: u64,
) -> Result<()> {
    check_mint_extensions(&ctx.accounts.mint.to_account_info())?;
    let market = &ctx.accounts.market;
    let params = &ctx.accounts.config.params;
    require!(market.active, ParityError::MarketInactive);
    require!(
        1 <= min_tenor_days && min_tenor_days <= max_tenor_days && max_tenor_days <= MAX_TENOR_DAYS,
        ParityError::InvalidTenor
    );
    require!(spread_bps <= MAX_SPREAD_BPS, ParityError::InvalidParams);
    require!(capacity_usd >= params.min_notional, ParityError::BelowMinNotional);

    let margin = offer_margin(capacity_usd, market.im_bps, spread_bps, params.maker_fee_share_bps)?;

    let a = &ctx.accounts;
    token_interface::transfer_checked(
        CpiContext::new(
            a.token_program.key(),
            TransferChecked {
                from: a.maker_ata.to_account_info(),
                mint: a.mint.to_account_info(),
                to: a.vault.to_account_info(),
                authority: a.maker.to_account_info(),
            },
        ),
        margin,
        a.mint.decimals,
    )?;

    let offer = &mut ctx.accounts.offer;
    offer.set_inner(MakerOffer {
        maker: ctx.accounts.maker.key(),
        nonce,
        market_id,
        mint: ctx.accounts.mint.key(),
        maker_side,
        spread_bps,
        min_tenor_days,
        max_tenor_days,
        capacity_usd,
        margin_locked: margin,
        position_counter: 0,
        active: true,
        bump: ctx.bumps.offer,
    });
    Ok(())
}

// ----------------------------------------------------------------------------- cancel_offer

#[derive(Accounts)]
pub struct CancelOffer<'info> {
    pub maker: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = maker @ ParityError::Unauthorized, has_one = mint @ ParityError::InvalidMint,
        seeds = [b"offer", offer.maker.as_ref(), offer.nonce.to_le_bytes().as_ref()], bump = offer.bump)]
    pub offer: Account<'info, MakerOffer>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, seeds = [b"vault", mint.key().as_ref()], bump,
        token::mint = mint, token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    /// Payout goes only to the maker's canonical ATA for the offer's mint.
    #[account(mut, associated_token::mint = mint, associated_token::authority = offer.maker,
        associated_token::token_program = token_program)]
    pub maker_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handle_cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
    require!(ctx.accounts.offer.active, ParityError::OfferInactive);
    let amount = ctx.accounts.offer.margin_locked;
    let a = &ctx.accounts;
    if amount > 0 {
        let seeds: &[&[u8]] = &[b"config", &[a.config.bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                a.token_program.key(),
                TransferChecked {
                    from: a.vault.to_account_info(),
                    mint: a.mint.to_account_info(),
                    to: a.maker_ata.to_account_info(),
                    authority: a.config.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            a.mint.decimals,
        )?;
    }
    let offer = &mut ctx.accounts.offer;
    offer.margin_locked = 0;
    offer.active = false;
    Ok(())
}
