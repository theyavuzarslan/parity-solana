# Submission drafts

Deadline: 2026-10-12, 11:59 pm PT (2026-10-13, 09:59 Istanbul). Numbers come from docs/market-research.md and docs/rates.md.

## 1. Colosseum project fields

**Name:** Parity

**Tagline (69/80 chars):**
Lock a future lira rate on Solana, priced from the interest-rate gap.

**Short description (252/280 chars):**
Parity is a dated FX and gold forward market on Solana for people who earn in dollars and spend in lira. The price comes from interest-rate parity, margin is in USDC or USDG, and a Hedge Advisor builds a ladder you open with one signature. Devnet only.

**Track:** Solana

**Links:**
- GitHub: https://github.com/theyavuzarslan/parity-solana
- Live demo (Vercel, devnet): https://parity-solana.vercel.app
- Pitch video: https://youtu.be/Snii0ximuSI
- Demo video: https://youtu.be/S7A4nLoHFCk
- Program ID (devnet): 55jabap7VG6LKKJtidxVRBuLaLzFz6P96uPUicR2e4EQ (https://explorer.solana.com/address/55jabap7VG6LKKJtidxVRBuLaLzFz6P96uPUicR2e4EQ?cluster=devnet)

**Long description:**

At the end of 2017 a dollar bought 3.77 Turkish lira. On 9 October 2026 it bought 49.13 (TCMB indicative rates). The lira lost 29% of its dollar value in two weeks of August 2018 and 43% over 2021. People in Turkey who are paid in dollars and pay their bills in lira cannot know what next month's income is worth. Turkey exported $6.7 billion of telecom, computer and information services in 2025, up 25% (TÜİK, Ministry of Trade), and a lot of that income arrives in dollars.

Parity lets two parties lock a future exchange rate on Solana. Nobody quotes the price. The program computes the forward from covered interest parity, `F = S × (1 + r_quote·t) / (1 + r_base·t)`, using spot from Pyth (on devnet, admin-relayed reference prices) and policy rates from a registry. With lira rates at 37% and dollar rates near 3.9%, the 90-day dollar-lira forward is about 8% above spot, and the app shows why.

How it works:
- Hedge Advisor (client-side). A short check-in (income, lira needs, horizon of 1, 3 or 6 months, how a 10% move against you would feel) produces a hedge ratio and a ladder: more of next month locked, less of later months. It is a hedge calculator, not financial advice.
- One signature, several positions. "Lock it" sends one atomic transaction with one `take_offer` per rung against maker offers. Each position is a ticket in the user's wallet.
- Margin and marks. Both sides post margin in USDC (SPL Token) or USDG (Token-2022). A permissionless keeper marks positions against Pyth. Below 50% of initial margin a position is called; below 20% on three fresh marks at least 30 seconds apart, 30% of it is liquidated.
- Loss waterfall. If a gap is larger than the margin, the loss goes loser margin → insurance fund → pro-rata haircut on the winner. Every step emits an event and is shown on a receipt in the app.
- Safe payouts. Every transfer out of the vault goes to a token account owned by the party being paid (any such account of the position's mint), so a permissionless caller cannot redirect funds and a party cannot block a payout by reassigning its ATA. Token accounts with a memo-transfer requirement or CPI guard are rejected.
- 15 markets. USD/TRY, EUR/TRY, GBP/TRY, gram gold in lira (GAU/TRY), EUR/USD, GBP/USD, USD/CHF, USD/JPY, USD/CNH, USD/MXN, USD/BRL, USD/ZAR, USD/INR, XAU/USD, XAG/USD. Weekend FX closure halts marks, so nothing is liquidated on a stale price.

Who it is for: freelancers and remote workers paid in dollars (our lead user), exporters and importers with 30-180 day invoices, and, as a proposed future product, savers who use gram gold.

Why Solana: positions need frequent, cheap marks; a ladder fits in one atomic transaction; USDC and USDG are both native; Pyth publishes the FX and metals feeds; positions are plain accounts other programs can read.

Business model: a 10 bps taker open fee, 10% of the maker's spread, and liquidation penalties that fill the insurance fund first.

Competition: Borsa Istanbul lists USD/TRY futures in $1,000 contracts with fixed expiries through Turkish brokers. On-chain, Ostium (Arbitrum) and Solana venues such as GMTrade and Flash Trade offer FX perpetuals, which have no maturity and a funding cost that changes over time. We did not find a USD/TRY listing on any of them. Parity offers dated forwards from $10, tenors of 1 to 365 days (the seeded demo offers quote 7 to 180), settled in stablecoins.

Status: a proposed design, deployed on Solana devnet with test tokens only. It is not offered to anyone, including Turkish residents, pending legal advice. Next steps are legal review, an audit, a licensed partner, and only then mainnet.

Prior work: Evolves an earlier Stellar hackathon prototype of the same idea (github.com/nurkardelens/parity-stellar); the Solana program and app were rebuilt from scratch.

## 2. Superteam Türkiye listing answers

**Project name:** Parity

**One line:** Lock a future lira rate on Solana, priced from the interest-rate gap.

**What problem does it solve for Turkey?**
People and small businesses in Turkey earn, owe and save in different currencies, and the lira can move a lot in a few days (29% of its dollar value in two weeks of August 2018, per TCMB indicative rates). A freelancer paid in dollars has no simple way to know next month's rent money in lira. Parity lets them lock that rate for the next 1, 3 or 6 months, in small sizes, with stablecoin margin.

**What did you build during the hackathon?**
A new Anchor program on Solana devnet (offers, positions, marks, partial liquidation, a three-step loss waterfall, settlement in USDC or USDG), a Next.js app with a Hedge Advisor, a wallet of positions, a 15-market board (Pyth in production; admin-relayed reference prices on devnet), an admin page for the demo, and a keeper. Everything was written from scratch for Solana.

**Why Solana?**
Cheap, frequent marks; several positions opened in one atomic transaction; USDC and USDG; Pyth feeds for FX and metals.

**Business model:** 10 bps open fee, 10% of the maker spread, liquidation penalties into the insurance fund first.

**Legal status:** Proposed design, devnet only, test tokens, not offered to anyone, including Turkish residents, pending legal advice. The Advisor is a hedge calculator, not financial advice.

**Links:** GitHub https://github.com/theyavuzarslan/parity-solana · Demo https://parity-solana.vercel.app · Pitch video https://youtu.be/Snii0ximuSI · Demo video https://youtu.be/S7A4nLoHFCk · Colosseum project page [LINK]

## 3. Team

| Name | Role | Bio | X | GitHub |
|---|---|---|---|---|
| Atakan Yavuzarslan | [FILL] | [FILL] | [FILL] | github.com/theyavuzarslan |

## 4. Prior-work disclosure

Evolves an earlier Stellar hackathon prototype of the same idea (github.com/nurkardelens/parity-stellar); the Solana program and app were rebuilt from scratch.

## 5. Superteam Türkiye checklist

- [ ] Both members registered on Colosseum before the deadline
- [ ] Turkey set as base country on each Colosseum profile
- [ ] Superteam Türkiye intake form submitted
- [ ] Joined the Superteam Türkiye Telegram group
- [ ] All materials in English
- [ ] Pitch video ≤ 3:00 (script: docs/pitch-script.md)
- [ ] Demo video ≤ 3:00 (storyboard: docs/demo-storyboard.md), recorded while FX markets are open
- [ ] Public GitHub repo with English README (program ID, devnet addresses, legal framing, prior-work disclosure)
- [ ] Submitted on Colosseum (Solana track)
- [ ] Submitted on the Superteam Earn listing
- [ ] All [LINK] and [FILL] placeholders replaced
