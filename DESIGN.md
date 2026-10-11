# Parity — Design System

<!--
THESIS: A locked rate is a ticket you hold. Parity refuses the trading-terminal (neon on black, candles, order books) and the generic bank card stack; every forward is a coupon with a route (USD → TRY), a departure (maturity) and a carbon-struck amount.
OWN-WORLD: Carrier navy and jet red on white coupon stock; carbon-purple numerals for every locked figure; tabbed coupon heads with hairline-ruled fields; stamps (LOCKED, MARGIN CALL, VOID, SETTLED) instead of toasts and badges.
STORY: A freelancer sees today's rate and the forward, understands the gap is the interest-rate difference, asks the Advisor, receives a 3-coupon ladder, presses one red button, and holds three tickets in a wallet that get stamped as life happens.
FIRST VIEWPORT (Advisor): left — persona tabs + exposure inputs + one red LOCK IT; centre — the ladder as three stacked coupons (numbered 1–3, tenor tab in red, USD → TRY route, carbon TRY amount); right — carbon-copy receipt of the whole hedge (strike, margin, fee, conditions).
FORM: Coupon Wallet (fused challenger "jet-age ticket wallet"); seed c910bf11; staging: coupon-book sequence (each rung tears off in order).
-->

Source world: jet-age airline ticket wallet, fused with Parity's facts. Quality bar: board `vernacular-ephemera-jet-age-ticket-wallet.webp`, hero `…-hero.webp` (impeccable.style/worlds/cards). Applied alongside Emil Kowalski `apple-design` / `emil-design-eng` (motion, feedback, typography) and Nutlope `hallmark` (no AI tells, locked tokens, 8 states, honest copy).

## 1. Vocabulary map (product fact → world grammar)

| Parity fact | Coupon Wallet form |
|---|---|
| Forward position / ladder rung | **Coupon**: tabbed head (MARKET · TENOR · STRIKE · No.), route row `USD → TRY`, departure = maturity date, carbon amount = locked TRY/quote amount |
| Hedge Advisor | **Booking desk**: itinerary builder that issues a coupon book |
| Positions page | **Wallet**: coupon stack, newest on top; settled ones stay, stamped |
| Markets page | **Live status board**: rows MARKET · SPOT · FWD 30/90/180D · CARRY · STATUS (OPEN / CLOSED / STALE) |
| Margin & waterfall | **Carbon copy** panel: the lilac duplicate showing the money path (loser margin → insurance → haircut) |
| Insurance fund | Panel in the rewards slot: big carbon numeral, mint (USDC/USDG) tabs |
| Admin / demo | **Dispatch office**: ruled control sheet; every action labelled with its effect |
| Legal status | **Conditions of contract** strip on every page (fine print, always visible) |
| Status changes | **Stamps**: LOCKED (navy), MARGIN CALL (red outline), PARTIAL (red outline + 30%), VOID (red, liquidated), SETTLED (carbon purple) |

The metaphor lives in grammar (tabs, ruled fields, stamps, carbon numerals). No planes, globes, luggage, boarding-pass barcodes, tulips, evil eyes or Iznik tiles. One mark only: the Parity wordmark.

## 2. Color (OKLCH tokens; never inline values)

```css
:root {
  --color-navy:        oklch(23% 0.06 265);   /* carrier navy #0D1B3D — ink, rules, primary text */
  --color-navy-2:      oklch(33% 0.07 265);   /* secondary ink */
  --color-red:         oklch(57% 0.21 27);    /* jet red #D7262D — the ONE action colour + tenor tabs + VOID */
  --color-red-press:   oklch(50% 0.20 27);
  --color-coupon:      oklch(100% 0 0);       /* coupon white — coupon faces */
  --color-stock:       oklch(96.5% 0.004 95); /* stock white — page ground */
  --color-carbon:      oklch(37% 0.14 295);   /* carbon purple #4B2E83 — every locked/filled figure */
  --color-copy:        oklch(82% 0.06 295);   /* carbon-copy lilac — duplicate panels */
  --color-copy-ink:    oklch(30% 0.12 295);
  --color-ok:          oklch(52% 0.12 155);   /* OPEN / healthy status outline only */
  --color-warn:        oklch(70% 0.15 70);    /* STALE / demo-mode chip */
  --color-rule:        oklch(23% 0.06 265 / 0.9);
  --color-hairline:    oklch(23% 0.06 265 / 0.18);
  --color-focus:       oklch(57% 0.21 27);
}
```
Strategy: **Restrained** (neutral stock + navy ink), red reserved for (a) the single primary action on a screen, (b) tenor tabs, (c) VOID/MARGIN CALL stamps. Gains/losses: sign + word + carbon/red ink, never colour alone. Dark mode: not in scope for the demo (paper world); respect `prefers-contrast: more` with solid rules.

## 3. Typography

- **Display / labels:** `Barlow Condensed` 600–800, uppercase for labels and tabs, tracking +0.04em at ≤14px, −0.01em at ≥48px. Headings roman only (no italics anywhere in headings).
- **Body:** `Barlow` 400/500, sentence case, 15–16px, line-height 1.5.
- **Carbon numerals (all money, rates, dates in data):** `Azeret Mono` 500–600, `font-variant-numeric: tabular-nums`, colour `--color-carbon`.
- Scale (rem): 0.75 · 0.875 · 1 · 1.25 · 1.5 · 2 · 3 · 4.5. Leading tight (1.0–1.05) on display, 1.5 body.
- Load via `next/font/google`.

## 4. Space, rules, radius

4-pt scale: `--space-1` 4px … `--space-12` 48px. Fields are separated by 1px `--color-hairline` rules; coupons have a 2px navy outline and a 4px offset navy shadow (`box-shadow: 4px 4px 0 var(--color-navy)`), like the reference. Radius: coupons 10px with **notched corners** (CSS mask radial cut-outs at the tear line); buttons 4px; chips 3px. Perforation: dashed rule between coupon body and stub.

## 5. Components

- **Coupon** — props: index, market, tenor, strike, notional, lockedAmount, maturity, status, mint. Head: navy index block + tabs; red tenor tab on the right. Body: route `USD → TRY` in display 2.5rem, maturity "SETTLES 12 JAN 2027", carbon amount. Stub (right, dashed perforation): position No., mint. Status renders as a **stamp** overlay rotated −6°.
- **Stamp** — LOCKED / MARGIN CALL / PARTIAL 30% / VOID / SETTLED; 2–3px border, condensed caps, slight ink texture via CSS mask noise; enters with a 180ms scale 1.15→1 + opacity (spring, no bounce).
- **StatusBoard** — ruled table, condensed caps headers, tabular numerals; status chips outline-only (OPEN green, CLOSED navy, STALE amber).
- **CarbonCopy** — lilac panel with dashed tear line top, copy-ink numerals; used for receipt and waterfall.
- **TabNav** — top nav of tab-caps links (ADVISOR · MARKETS · WALLET · DISPATCH), active tab = filled navy with notch; on phones a bottom bar of the same tabs.
- **Button** — primary: red fill, condensed caps, 4px radius; secondary: navy 2px outline; ghost: underlined caps. All 8 states (default, hover, focus-visible ring 2px red offset 2px, active scale .97 on pointer-down, disabled, loading = thinking-orb + "Signing…", error, success = stamp).
- **Field** — ruled input with tab label above (PASSENGER-style: "MONTHLY INCOME (USD)"), carbon numerals when filled.
- **RiskSwitch** — 3-segment tab: CAUTIOUS · BALANCED · OPPORTUNISTIC.
- **ConditionsStrip** — fine-print footer band: "Conditions of contract: Proposed design · Solana devnet · test tokens only · not offered to anyone, including Turkish residents, pending legal advice. Hedge calculator, not financial advice." + DEMO MODE chip when on.
- **Orb** — `thinking-orbs` loader, navy, used for pending tx / price loading.

## 6. Motion (Emil / Apple rules)

Feedback on pointer-down; springs critically damped (`bounce: 0`, ~0.35s) for layout; coupons issue in sequence (40ms stagger, translateY 8px → 0 + opacity) when a ladder is created; stamps land with one short scale settle; numbers tick by cross-fade, never count-up theatrics. Only `transform`/`opacity`. `prefers-reduced-motion`: opacity cross-fades ≤150ms, no scale. No looping animation except the orb while pending.

## 7. Layout

Desktop (primary, 1440px): 12-col, top bar with wordmark + tab nav + wallet button; each page = ruled panels separated by 1px navy rules (newspaper-free; it's a ticket office counter). Phone: single column, coupons full-width stacked, bottom tab bar, no horizontal scroll at 320px.

## 8. Copy

Plain, short, airline-desk voice: "Lock it", "Your next settlements", "Rate gap (carry)", "Market closed — FX reopens Sunday 22:00 UTC". Never "leverage", "kaldıraç", "forex", "pay rent with USDC". Numbers always with units (₺, $, %, days). Synthetic/demo values labelled "demo".
