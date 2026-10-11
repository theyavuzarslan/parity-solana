# Demo video storyboard (≤ 3:00)

Screen recording at 1440×900, desktop Chrome, Phantom on devnet. Voice-over is optional; on-screen captions carry the story. Labels match DESIGN.md (tabs ADVISOR · MARKETS · WALLET · DISPATCH; risk switch CAUTIOUS · BALANCED · OPPORTUNISTIC; button LOCK IT).

## Before you record

- **Record while FX markets are open** (Sunday 22:00 UTC to Friday close). On a weekend the board shows "Market closed" and marks halt.
- Keeper script running and printing marks. Maker offers seeded for USD/TRY in **USDG** at 30, 60 and 90 days. [CONFIRM with build]
- Freelancer wallet funded from the faucet with test USDG (enough for three rungs plus extra margin on two of them).
- Insurance fund for USDG seeded small on purpose, so the VOID scene shows all three waterfall steps including a winner haircut. [CONFIRM amount with build]
- Second browser tab open on DISPATCH with the admin wallet.
- TRY amounts below are written "≈" because they come from live spot on the day. At the TCMB indicative rate of 9 Oct 2026 (49.13), ₺60,000 ≈ $1,221.

## Continuity decision

All three tickets are the same market and side, so one price move hits them by the same percentage. If nothing changes, the gap that voids ticket 1 voids all three and nothing is left to settle. **Decision: after the margin call, the freelancer adds margin to tickets 2 and 3 only. Ticket 1 goes PARTIAL, then VOID on the gap; tickets 2 and 3 survive and settle.** [CONFIRM with build: the add-margin amount must keep tickets 2 and 3 above the liquidation line after the gap.]

## Shot list

| # | Time | Screen | Exact clicks / actions | Caption on screen |
|---|---|---|---|---|
| 1 | 0:00-0:10 | Landing | Load the app URL. Hold on the hero (USD/TRY line). | "Parity: lock a future exchange rate on Solana. Devnet, test tokens." |
| 2 | 0:10-0:15 | Landing → Advisor | Click **Connect** → Phantom → Approve. Click **ADVISOR** tab. | none |
| 3 | 0:15-0:40 | Advisor, guided check-in | Persona tab **FREELANCER**. Field MONTHLY INCOME (USD): type `3000`. Field LIRA NEEDED PER MONTH: type `60000`. Horizon: select `3` months. Question "If the lira moved 20% against you, how would that feel?" → click **Manageable** (maps to **BALANCED** on the risk switch). [CONFIRM label mapping with build] | "Hedge calculator, not financial advice." |
| 4 | 0:40-0:55 | Advisor, coupons issue | Wait for the ladder: three coupons tear off in order (1 · 30D, 2 · 60D, 3 · 90D). Hover the formula strip on coupon 3 to show spot, forward and carry. | "Forward = spot × rate gap. Lira 37%, dollar under 4%." |
| 5 | 0:55-1:05 | Advisor, receipt | On the carbon-copy receipt select mint tab **USDG**. Click **LOCK IT**. Phantom shows one transaction → **Approve**. LOCKED stamp lands on each coupon. | "One signature, three positions." |
| 6 | 1:05-1:12 | Wallet | Click **WALLET** tab. Three tickets, newest on top, each LOCKED, margin bar full. | "Your next settlements." |
| 7 | 1:12-1:22 | Dispatch | Switch to the admin tab. **DISPATCH** → toggle **DEMO MODE** on (amber chip appears on every page). Market USD/TRY → SET DEMO PRICE: spot +6% → **Apply**. | "Demo mode: prices set by admin." |
| 8 | 1:22-1:32 | Wallet | Back to freelancer tab. Keeper marks (status line updates). **MARGIN CALL** stamp lands on all three tickets. | "The lira fell. Her tickets lose; her dollar paycheck gains the same in lira." |
| 9 | 1:32-1:42 | Wallet | On ticket 2 click **Add margin** → enter amount → Approve. Repeat on ticket 3. Their stamps clear; ticket 1 stays called. | "She tops up two tickets and leaves one." |
| 10 | 1:42-1:55 | Dispatch → Wallet | DISPATCH: USD/TRY spot to +9% → Apply. Freelancer tab: breach counter on ticket 1 goes 1/3 → 2/3 → 3/3 over three keeper marks (≥30 s apart; speed up 4× in edit). Keeper liquidates: **PARTIAL 30%** stamp. | "Three confirmed breaches, then 30% closed. Not one bad tick." |
| 11 | 1:55-2:15 | Dispatch → Wallet | DISPATCH: USD/TRY gap to +20% in one step (an August 2018-style day) → Apply. Ticket 1 gets **VOID**. Open its carbon copy: loser margin → insurance fund → winner haircut, each line with an amount. | "A gap bigger than the margin. The loss path is on the receipt." |
| 12 | 2:15-2:30 | Dispatch → Wallet | DISPATCH: SET DEMO CLOCK **+90d** → Apply. Keeper settles. Tickets 2 and 3 get **SETTLED** stamps, payout shown in **USDG**. | "Settled in USDG at maturity." |
| 13 | 2:30-2:50 | Markets | Click **MARKETS**. Scroll the board slowly: 15 rows (USD/TRY, EUR/TRY, GBP/TRY, GAU/TRY, EUR/USD, GBP/USD, USD/CHF, USD/JPY, USD/CNH, USD/MXN, USD/BRL, USD/ZAR, USD/INR, XAU/USD, XAG/USD) with spot, FWD 30/90/180D, carry, status. Pause on **GAU/TRY** (gram gold). | "15 markets on Pyth. Gram gold in lira is a proposed future product." |
| 14 | 2:50-2:55 | Any page | Theme switch **Ticket \| Solana**: click Solana, hold 1 s, click Ticket. | none |
| 15 | 2:55-3:00 | Conditions strip | Zoom on the footer strip. | "Proposed design · Solana devnet · test tokens only · not offered to anyone, including Turkish residents, pending legal advice." |

## Open question for the build (shot 10)
Spec §5 closes 30%, scales Q and IM to 70%, then closes fully if equity is still below 20% of the reduced IM. Scaling both by 70% leaves the equity/IM ratio about the same (slightly worse after the 1% penalty), so at a steady +9% the same instruction may close the whole ticket and PARTIAL never shows as a resting state. Options: (a) the keeper liquidates while the price eases back (e.g. set spot to +7% right after breach 3/3), or (b) the program judges the remainder against the pre-penalty equity. [CONFIRM with build before recording]

## Edit notes
- Shot 10 needs three marks at least 30 s apart (`liq_confirm_min_gap_secs`). Record in real time, speed up in the edit, and show a "4×" badge so nobody thinks it was faked.
- If Phantom pop-ups cover the coupons, crop them out after the Approve click; keep the first one in shot 5.
- Keep DEMO MODE visible from shot 7 to the end.
- Total without voice-over ≈ 3:00. If long, shorten shot 13 first.
