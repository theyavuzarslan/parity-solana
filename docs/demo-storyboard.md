# Demo video storyboard (≤ 3:00)

Screen recording at 1440×900, desktop Chrome, Phantom on devnet. Voice-over is optional; on-screen captions carry the story. Labels match the build: tabs ADVISOR · MARKETS · WALLET · DISPATCH; check-in "feel" cards **Painful · Manageable · I'd take the chance** (there is no risk switch); button **Lock it**.

## Before you record

- **Demo mode is already on.** The relay (`pnpm --filter scripts relay`) keeps it on and writes admin-relayed reference prices every 10 s, so every market reads OPEN at any hour (a demo price carries `publish_time = now`). Do not toggle it in the video: turning it off pauses trading on devnet, and the relay turns it back on at its next tick.
- **Run the relay in ECB mode (no `PYTH_API_KEY`).** In ECB mode a Dispatch shock stays until the daily reference changes. In Hermes mode the relay overwrites Dispatch shocks every tick.
- Keeper running in a visible terminal (`pnpm --filter scripts keeper`). It marks every 5 s and prints `breach=N`; liquidation needs 3 marks at least 30 s apart.
- Seeded maker offers: every market, both sides, in USDC; USDG offers on the 5 demo markets (USD/TRY, EUR/TRY, GAU/TRY, EUR/USD, XAU/USD). Tenors 7–180 days, capacity $250k each, 40 bps spread on USD/TRY. The 3-month ladder uses 30, 60 and 90 days, all inside that range.
- Freelancer wallet: devnet SOL from faucet.solana.com (at least 0.01 SOL), then one faucet click (10,000 test USDC + 10,000 test USDG). That covers the ladder and every top-up below.
- Insurance funds hold $25,000 per mint (`05-insurance.ts`). The VOID receipt therefore shows loser margin → insurance fund with a $0.00 winner haircut. Do not caption a haircut.
- Second browser tab on DISPATCH with the admin wallet (`config.admin`).
- TRY amounts are "≈" because they come from the relayed price on the day. At the TCMB indicative rate of 9 Oct 2026 (49.13), ₺60,000 ≈ $1,221.
- **Dry-run shots 7–11 once before recording**, then DISPATCH → **Reset demo state** (prices return on the relay's next tick). The partial-liquidation band is narrow: see the shock plan.

## Shock plan (what the build does)

Dispatch offers −5%, +5% and a +12% gap per market. A USD/TRY shock scales the USD/TRY feed everywhere it is used, so EUR/TRY, GBP/TRY and GAU/TRY move too. Shocks compound.

- **+5% twice (≈ +10.25%)**: a short USD/TRY coupon with 12% initial margin falls below 50% of IM (MARGIN CALL) and below 20% of IM. After three fresh marks the keeper liquidates 30% and the coupon rests at **PARTIAL**.
- **+12% gap on top (≈ +23.5% in total)**: the remaining 70% goes straight to **VOID** through the waterfall.
- A single +12% gap on a fresh coupon skips PARTIAL and goes straight to VOID, so never use it first.

## Continuity

All three coupons are the same market and side, so one move hits them by the same percentage. After the margin call the freelancer tops up coupons 2 and 3 only: two clicks each on **Add $N margin** (each click adds 50% of that coupon's initial margin). Coupon 1 goes PARTIAL, then VOID on the gap; coupons 2 and 3 stay above the liquidation line (MARGIN CALL at worst) and settle.

## Shot list

| # | Time | Screen | Exact clicks / actions | Caption on screen |
|---|---|---|---|---|
| 1 | 0:00-0:10 | Landing | Load the app URL. Hold on the hero (USD/TRY line; spot source "Admin-relayed reference price (ECB daily)"). | "Parity: lock a future exchange rate on Solana. Devnet, test tokens." |
| 2 | 0:10-0:15 | Landing → Advisor | Click **Connect** → Phantom → Approve. Click the **ADVISOR** tab. | none |
| 3 | 0:15-0:40 | Advisor, guided check-in | Card **Paid in USD/EUR**. Income: type `3000` → **Next**. Lira need: type `60000` → **Next**. Card **3 months**. Question "If the lira moved 10% against you, how would it feel?" → card **Manageable**. | "Hedge calculator, not financial advice." |
| 4 | 0:40-0:55 | Advisor, coupons issue | The book prints three coupons (1 · 30D, 2 · 60D, 3 · 90D). Scroll to "Why this ratio" for spot, forward and carry. | "Forward = spot × rate gap. Lira 37%, dollar under 4%." |
| 5 | 0:55-1:05 | Advisor, receipt | On the receipt, "Margin in" → **Test USDG**. Click **Lock it**. Phantom shows one transaction → **Approve**. LOCKED lands on each coupon. | "One signature, three positions." |
| 6 | 1:05-1:12 | Wallet | **WALLET** tab. Three coupons, newest on top, each LOCKED, margin bar full. | "Your next settlements." |
| 7 | 1:12-1:24 | Dispatch → Wallet | Admin tab, **DISPATCH** (DEMO chip already on). USD/TRY row → **+5%**, then **+5%** again (the log names EUR/TRY, GBP/TRY and GAU/TRY as moved too). Freelancer tab: the keeper marks; **MARGIN CALL** lands on all three. | "The lira fell about 10%. Her coupons lose; her dollar paycheck gains the same in lira." |
| 8 | 1:24-1:36 | Wallet | Coupon 2: **Add $N margin** → Approve, twice. Same on coupon 3. Coupon 1 is left alone. | "She tops up two coupons and leaves one." |
| 9 | 1:36-1:52 | Keeper terminal → Wallet | Keeper log for coupon 1: `breach=1` → `2` → `3` over three marks (≥ 30 s apart; speed up 4× in edit), then `liquidate … -> PartiallyLiquidated`. Wallet: **PARTIAL** on coupon 1. | "Three confirmed breaches, then 30% closed. Not one bad tick." |
| 10 | 1:52-2:12 | Dispatch → Wallet | DISPATCH: USD/TRY → **+12% gap** (an August 2018-style day). Coupon 1 gets **VOID**. Open its carbon copy: loser margin → insurance fund (winner haircut $0.00), each line with an amount. | "A gap bigger than the margin. The loss path is on the receipt." |
| 11 | 2:12-2:28 | Dispatch → Wallet | DISPATCH: **Clock +90d**, then **Settle** (or wait for the keeper). Coupons 2 and 3 get **SETTLED**, payout shown in **USDG**. | "Settled in USDG at maturity." |
| 12 | 2:28-2:48 | Markets | **MARKETS** tab. The status line reads "admin-relayed reference prices … Prices last relayed hh:mm UTC". Scroll the 15 rows (USD/TRY, EUR/TRY, GBP/TRY, GAU/TRY, EUR/USD, GBP/USD, USD/CHF, USD/JPY, USD/CNH, USD/MXN, USD/BRL, USD/ZAR, USD/INR, XAU/USD, XAG/USD) with spot, FWD 30/90/180D, carry, status. Pause on **GAU/TRY** (gram gold). | "15 markets. Devnet: admin-relayed reference prices; production reads Pyth on-chain. Gram gold in lira is a proposed future product." |
| 13 | 2:48-2:55 | Any page | Theme switch **Ticket \| Solana**: click Solana, hold 1 s, click Ticket. | none |
| 14 | 2:55-3:00 | Conditions strip | Zoom on the footer strip. | "Proposed design · Solana devnet · test tokens only · not offered to anyone, including Turkish residents, pending legal advice." |

## After recording

DISPATCH → **Reset demo state**: the clock returns to +0 and every demo price is cleared; the relay writes the reference prices again within about 10 s.

## Edit notes

- Shot 9 needs three marks at least 30 s apart (`liq_confirm_min_gap_secs`). Record in real time, speed up in the edit, and show a "4×" badge so nobody thinks it was faked.
- If Phantom pop-ups cover the coupons, crop them out after the Approve click; keep the first one in shot 5.
- Keep the DEMO chip visible from shot 7 to the end.
- Total without voice-over ≈ 3:00. If long, shorten shot 12 first.
