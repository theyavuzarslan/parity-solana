# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Freelancers and remote workers in Turkey paid in USD/USDC** (hero persona). They earn dollars monthly and owe lira for rent and bills; the job is to know next months' lira amount today.
- **Turkish exporters and importers (SMEs).** Exporters invoice in EUR/USD and pay costs in TRY; importers owe USD/CNH and hold TRY. The job is to lock receivables/payables over 30–180 days.
- **Savers** who protect against lira depreciation, usually with gram gold. Presented as a proposed future product.
- **Hackathon judges** (Colosseum Solana track, Superteam Türkiye) evaluating a 3-minute screen-recorded demo on desktop. Desktop is the primary design target; phone layouts stay fully responsive.

## Product Purpose
Parity lets two parties lock a future exchange rate (FX or gold) on Solana. The forward price is computed on-chain from interest-rate parity, both sides post margin in USDC or USDG, positions are marked to market, and losses follow an explicit waterfall (loser margin → insurance fund → winner haircut). A client-side Hedge Advisor tells each user how much to hedge and builds a one-click ladder of forwards. Success for this build: a working devnet demo that a judge understands in three minutes.

## Positioning
The price is not quoted by a dealer: it falls out of the interest-rate gap (covered interest parity), visibly and verifiably. The same Advisor gives opposite advice to opposite users and shows why: the lira's high carry makes hedging favourable for USD earners and expensive for lira holders.

## Operating Context
- Solana devnet, test USDC and test USDG from an in-app faucet; Phantom/Solflare/Backpack wallets.
- Live prices from Pyth; FX markets close at weekends (UI must show "Market closed").
- Demo is driven by an admin page that shocks prices and moves the clock; a keeper marks positions.
- 15 markets: USD/TRY, EUR/TRY, GBP/TRY, GAU/TRY (gram gold), EUR/USD, GBP/USD, USD/CHF, USD/JPY, USD/CNH, USD/MXN, USD/BRL, USD/ZAR, USD/INR, XAU/USD, XAG/USD.

## Capabilities and Constraints
- Pages: Onboarding/persona + faucet, Hedge Advisor, Markets, Positions, Admin/demo.
- Every surface carries: "Proposed design · Solana devnet · test tokens only · not offered to anyone, including Turkish residents, pending legal advice." Advisor is a "hedge calculator, not financial advice". Demo mode must be visible on every page when on.
- Copy rules: English only; never "leverage", "kaldıraç", "forex", or "pay rent with USDC"; say "lock a rate".
- Minimum initial margin 10%.
- Stack: Next.js App Router, Tailwind, Anchor TS client, wallet-adapter.

## Brand Commitments
- Name: **Parity** (kept from the Stellar prototype).
- No prior visual assets are binding; start fresh.
- Loading/pending states use `thinking-orbs` (MIT). Optional hand-painted USD/TRY line via `p5.brush` on the landing hero only.
- Design guidance to apply alongside Impeccable: Emil Kowalski's `apple-design` and `emil-design-eng`, and Nutlope `hallmark` (anti-generic-AI look).

## Evidence on Hand
- Real live prices (Pyth), real policy rates (docs/rates.md once researched), real devnet transactions.
- No users, testimonials, traction, partners or licences exist — never fabricate them.

## Product Principles
1. The number is the product: spot, forward, carry and the locked amount must be the most legible things on every screen.
2. Show the mechanism, not just the result: the formula, the margin bar and the waterfall are visible, not hidden.
3. One decision per screen: the Advisor leads to one action ("Lock it").
4. Honest status everywhere: devnet, demo mode, market closed, proposed product.
5. Built for Turkish realities without Turkish-language marketing.

## Accessibility & Inclusion
WCAG 2.2 AA contrast; numbers in tabular figures; gains/losses never signalled by colour alone (sign and label too); respects reduced motion.
