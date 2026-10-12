# Parity — Design System

<!--
THESIS: A locked rate is a ticket you hold. Parity refuses the trading-terminal (neon on black, candles, order books) and the generic bank card stack; every forward is a coupon with a route (USD → TRY), a departure (maturity) and a carbon-struck amount.
OWN-WORLD: Carrier navy and jet red on white coupon stock; carbon-purple numerals for every locked figure; tabbed coupon heads with hairline-ruled fields; stamps (LOCKED, MARGIN CALL, VOID, SETTLED) instead of toasts and badges.
STORY: A freelancer sees today's rate and the forward, understands the gap is the interest-rate difference, asks the Advisor, receives a 3-coupon ladder, presses one red button, and holds three tickets in a wallet that get stamped as life happens.
FIRST VIEWPORT (Advisor, 1440×900): left — guided check-in (one question per step) ending in a summary and one red primary button (Next → Issue my coupons → the current setup step → LOCK IT), always above the sticky ConditionsStrip; centre — the ladder as stacked coupons (numbered, tenor tab in red, USD → TRY route, carbon TRY amount); right — carbon-copy stub-ticket receipt (display-size total, margin, fee, conditions) or the 3-step setup checklist.
FORM: Coupon Wallet (fused challenger "jet-age ticket wallet"); seed c910bf11; staging: coupon-book sequence (each rung tears off in order).
-->

Source world: jet-age airline ticket wallet, fused with Parity's facts. Quality bar (local copies): board `design-ref/board.png`, hero `design-ref/hero.png` (from impeccable.style/worlds/cards). Applied alongside Emil Kowalski `apple-design` / `emil-design-eng` (motion, feedback, typography) and Nutlope `hallmark` (no AI tells, locked tokens, 8 states, honest copy).

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

The metaphor lives in grammar (tabs, ruled fields, stamps, carbon numerals). No planes, globes, luggage, boarding-pass barcodes (the issued ticket's signature strip is the one exception: real data — the transaction signature's base58 digits drawn as bars, always labelled with the short signature), tulips, evil eyes or Iznik tiles. One mark only: the Parity wordmark.

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
  --color-gold:        oklch(76% 0.12 85);    /* gold-foil stub — GAU/TRY, XAU/USD, XAG/USD order tickets only */
  --color-gold-2:      oklch(86% 0.09 90);    /* foil sheen highlight (one static 135° gradient, .stub-gold) */
  --color-gold-ink:    oklch(30% 0.07 70);    /* ink on gold foil */
  --color-scrim:       oklch(23% 0.06 265 / 0.55); /* order-ticket sheet backdrop */
}
```
Strategy: **Restrained** (neutral stock + navy ink), red reserved for (a) the single primary action on a screen, (b) tenor tabs, (c) VOID/MARGIN CALL stamps. Gains/losses: sign + word + carbon/red ink, never colour alone. No automatic dark mode (paper world); the graphite Theme B (§9) is an explicit user choice. Respect `prefers-contrast: more` with solid rules.

## 3. Typography

- **Display / labels:** `Barlow Condensed` 600–800, uppercase for labels and tabs, tracking +0.04em at ≤14px, −0.01em at ≥48px. Headings roman only (no italics anywhere in headings).
- **Body:** `Barlow` 400/500, sentence case, 15–16px, line-height 1.5.
- **Carbon numerals (all money, rates, dates in data):** `Azeret Mono` 500–600, `font-variant-numeric: tabular-nums`, colour `--color-carbon`.
- Scale (rem): 0.75 · 0.875 · 1 · 1.25 · 1.5 · 2 · 3 · 4.5. Leading tight (1.0–1.05) on display, 1.5 body.
- Load via `next/font/google`.

## 4. Space, rules, radius

4-pt scale: `--space-1` 4px … `--space-12` 48px. Fields are separated by 1px `--color-hairline` rules; coupons have a 2px navy outline and a 4px offset navy shadow, like the reference. The shadow is a `filter: drop-shadow(4px 4px 0 navy)` on the `.ticket-shell` wrapper so it follows the notches; the face (`.ticket`) is masked with two radial cut-outs where the tear line meets the edge, and `.ticket-ring` elements draw the navy arc of each notch. Radius: coupons 10px; buttons 4px; chips 3px. Perforation: dashed rule between coupon body and stub — vertical (stub column on the right, notches top and bottom) when the coupon is ≥ 32rem wide, horizontal (stub row at the bottom, notches left and right) below that (container query).

## 5. Components

- **Coupon** — props: index, market, tenor, strike, notional, lockedAmount, maturity, status, mint, past. Head: navy index block + tabs; red tenor tab sits over the stub column. Body: route `USD → TRY` in display 2–2.5rem, maturity "SETTLES 12 JAN 2027", carbon amount; extra content (margin bar, PnL, no-seat actions) lives in the body beside the stub. Stub (right, dashed perforation, notched): position No., mint, notional, tag. Status renders as a **stamp** rotated −6°. VOID adds a red hatched stub edge (`.void-edge`, board.png card). `past` = greyed, no shadow (Past tickets). **BlankCoupon**: dashed edge and notches, empty ruled fields, "—", faint watermark ("NO TICKETS YET" / "PRINTS AFTER CHECK-IN").
- **TicketSheet** (order ticket) — LOCK IT opens a modal sheet that grows out of the button (critically damped spring; reduced motion → fade). QUOTE: the first rung as a full Coupon (spot today → locked rate, settlement date, carbon amount received, margin, open fee, maker spread, price-source tag from `sourceLabel`), "QUOTE · VALID 60s" with a live countdown (screen readers hear it in 10-s steps); on expiry it re-quotes and re-runs preflight — a stale quote is never signed. Ladders are a booklet: full ticket + one stacked stub per further rung (date, amount) + a totals stub. Actions: "Sign & lock" (primary) and "Back"; Esc closes before signing; focus is trapped. ISSUED: LOCKED stamp, ticket No. from the position, the signature strip (Explorer link on devnet; mock provider: "preview — not on chain", no link), "View in Wallet" + "Done". Failure: NOT ISSUED stamp (red, VOID-style edge), readable error, "Try again". Gold markets swap the stub for `.stub-gold` and show grams and ounces; in the Solana skin the gold stub is flat (gold rule and ink, no sheen).
- **Stamp** — LOCKED / MARGIN CALL / PARTIAL 30% / VOID / SETTLED / NOT ISSUED (red, order ticket failed) / NO SEATS (navy outline: no maker quotes that tenor); 2–3px border, condensed caps, slight ink texture via CSS mask noise; enters with a 180ms scale 1.15→1 + opacity (spring, no bounce).
- **StatusBoard** — ruled table, condensed caps headers, tabular numerals; status chips outline-only (OPEN green, CLOSED navy + "FX reopens Sunday 22:00 UTC", STALE amber = no feed/demo price, REF dashed navy-2 = ECB daily reference, "not a live feed"). Every spot carries a source tag under it (Pyth · ECB 09 OCT · demo · last 14:02 UTC).
- **CarbonCopy** — a lilac **stub ticket** (hero.png "carbon copy"): four notched corners plus a notch at the top of the tear; a vertical dashed perforation splits off a stub column (No., mint, count, status); a horizontal dashed tear; then a display-size carbon total (`.carbon-total`, `clamp(1.75rem, 13cqi, 3rem)` so long lira totals fit the column) and ruled copy lines. Used for the Advisor receipt (which becomes the 3-step setup checklist — Connect wallet → Get test SOL → Get test USDC, current step filled — when the wallet is not ready), the loss waterfall, devnet setup and marking conditions.
- **Check-in** — one question per step (What describes you best? · monthly amount · lira need · horizon 1/3/6 months · how a 10% move would feel), ticket-style tappable cards (2px navy, dashed stub with A/B/C/✓), five progress ticks that reopen answered steps, Back, Enter submits numeric steps. Step 6 is a summary sentence, editable answer chips and one sentence of why. Comfort maps to the advisor risk keys (Painful → conservative, Manageable → balanced, I'd take the chance → opportunistic).
- **TabNav** — top nav of tab-caps links (ADVISOR · MARKETS · WALLET · DISPATCH), active tab = filled navy with notch; on phones a bottom bar of the same tabs.
- **Button** — primary: red fill, condensed caps, 4px radius; secondary: navy 2px outline; ghost: underlined caps. All 8 states (default, hover, focus-visible ring 2px red offset 2px, active scale .97 on pointer-down, disabled, loading = thinking-orb + "Signing…", error, success = stamp).
- **Field** — ruled input with tab label above (PASSENGER-style: "MONTHLY INCOME (USD)"), carbon numerals when filled.
- **RiskSwitch** — 3-segment tab: CAUTIOUS · BALANCED · OPPORTUNISTIC.
- **ConditionsStrip** — fine-print footer band: "Conditions of contract: Proposed design · Solana devnet · test tokens only · not offered to anyone, including Turkish residents, pending legal advice. Hedge calculator, not financial advice." + DEMO MODE chip when on.
- **Orb** — `thinking-orbs` loader, navy, used for pending tx / price loading.

## 6. Motion (Emil / Apple rules)

Feedback on pointer-down; springs critically damped (`bounce: 0`, ~0.35s) for layout; coupons issue in sequence (40ms stagger, translateY 8px → 0 + opacity) when a ladder is created; stamps land with one short scale settle; numbers tick by cross-fade, never count-up theatrics. Only `transform`/`opacity`. `prefers-reduced-motion`: opacity cross-fades ≤150ms, no scale. No looping animation except the orb while pending.

## 7. Layout

Desktop (primary, 1440px): 12-col, top bar with wordmark + tab nav + theme toggle + wallet button. Landing and Advisor are a **ruled sheet** (`.sheet`, hero.png): the grid has `gap: 1px` over a navy background, so every panel is separated by a 1px navy rule — vertical between columns, horizontal between rows — running edge to edge under the header. Advisor: check-in 4 cols (sticky) · coupon book 5 · receipt 3; second row mechanism 5 · scenarios 7. Landing: promise 5 · price mechanism 4 · personas 3; second row live status 7 · devnet setup 5. The ConditionsStrip is sticky at the bottom on ≥ md. First paint never waits on the network: seeded ECB reference rates render synchronously (also in the server HTML), live prices overlay after; no loading orb for reads. Phone: single column (horizontal rules between panels), coupons full-width stacked, bottom tab bar, no horizontal scroll at 320px.

## 8. Copy

Plain, short, airline-desk voice: "Lock it", "Your next settlements", "Rate gap (carry)", "Market closed — FX reopens Sunday 22:00 UTC", "Prices are paused — rates can't be locked on a stale price", "No maker is quoting USD/TRY for 180 days right now". Never "leverage", "kaldıraç", "forex", "pay rent with USDC". Numbers always with units (₺, $, %, days). Synthetic/demo values labelled "demo" on every surface (XAU/XAG spots, seed rates: "Rates: demo, to be verified"); ECB-sourced spots say "ECB reference rate (daily) — not a live feed".

## 9. Theme B — "Solana-native finance"

A second skin over the same components and data, chosen with the top-bar toggle **Ticket | Solana** (persisted in `localStorage["parity-theme"]`, default Ticket; an inline head script sets `<html data-theme="solana">` before paint). Covers Landing, Advisor, Markets, Wallet; Dispatch inherits the tokens without extra skinning.

```css
:root[data-theme="solana"] {
  --color-stock:   oklch(15.5% 0.006 275);  /* graphite ground */
  --color-coupon:  oklch(19.5% 0.007 275);  /* surface */
  --color-navy:    oklch(95% 0.004 275);    /* primary ink */
  --color-navy-2:  oklch(72% 0.012 275);    /* secondary ink */
  --color-carbon:  oklch(92% 0.02 295);     /* numerals */
  --color-copy:    oklch(21.5% 0.012 290);  /* receipt surface */
  --color-copy-ink:oklch(90% 0.02 290);
  --color-red:     oklch(68% 0.17 22);      /* losses / danger only */
  --color-ok:      oklch(78% 0.15 160);     /* gains only */
  --color-hairline:oklch(100% 0 0 / 0.09);  /* 1px borders */
  --color-rule:    oklch(100% 0 0 / 0.14);
  --color-focus:   oklch(82% 0.13 180);
  --sol-a:         oklch(70% 0.2 300);      /* gradient start (purple) */
  --sol-b:         oklch(84% 0.15 170);     /* gradient end (teal) */
  --ticket-drop:   0 10px 24px oklch(0% 0 0 / 0.35);  /* soft depth, never a glow */
  --font-display / --font-body: Geist;  --font-mono: Geist Mono (tabular numerals)
}
```
Rules: 1px borders everywhere (2px ink rules collapse to faint 1px rules); sentence-case labels; no stamps' ink texture or rotation (flat status pills); no masks/notches. The purple→teal gradient appears **only** on the primary button and on the active ladder rung's progress line — never on backgrounds, never as a glow. The ladder and the wallet render as stacked **position rows** (`PositionRow`): market · side · tenor · No., strike and notional, locked amount, a status pill, and a progress line from today to the settlement date on a shared time axis ("today … +180 days"). Green/red only for PnL, always with a +/− sign and a word (gain / loss / flat). No neon charts, no candles. Tenor tabs, the "///" kicker, wordmark accent and route arrows go neutral (red is reserved for loss/danger).
