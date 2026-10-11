# Rates registry seed values

As of **2026-10-12**. These are the values the `Rate` accounts are seeded with on devnet (spec §3). They are admin-set; nothing on chain reads a central bank directly. Re-check before any re-seed: the Fed meets 27–28 Oct, TCMB 22 Oct, ECB 29 Oct, BoJ 29–30 Oct.

| Code | Rate % | rate_bps | Basis days | As-of (decision / effective) | Source URL | Confidence |
|---|---|---|---|---|---|---|
| USD | 3.875 (midpoint of 3.75–4.00) | 388 ¹ | 360 | FOMC 16 Sep 2026, effective 17 Sep | https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm | High. Official statement, 12–0 vote. |
| TRY | 37.00 (one-week repo) | 3700 | 365 | Held 10 Sep 2026; last change 23 Jan 2026 | https://www.tcmb.gov.tr/wps/wcm/connect/EN/TCMB+EN/Main+Menu/Core+Functions/Monetary+Policy/Central+Bank+Interest+Rates/1+Week+Repo | High. TCMB table shows 37.00 since 23.01.2026; the 10 Sep hold is reported by bne IntelliNews (https://new.intellinews.com/articles/turkish-central-bank-sticks-to-37-policy-rate-for-fifth-straight-time-467058). |
| EUR | 2.50 (deposit facility) | 250 | 360 | Effective 16 Sep 2026 | https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html | High. Official ECB table. |
| GBP | 3.75 (Bank Rate) | 375 | 365 | Last change 18 Dec 2025; held 17 Sep 2026 | https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp | High. Official BoE database. |
| CHF | 0.00 (SNB policy rate) | 0 | 360 | 24 Sep 2026 assessment | https://www.snb.ch/en/publications/communication/press-releases-restricted/pre_20260924 | High. Official press release. |
| JPY | 1.25 (uncollateralised overnight call rate target) | 125 | 360 | Decided 18 Sep 2026, effective 24 Sep 2026 | https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2026/k260918a.pdf | High. Official statement, 7–2 vote. |
| CNH | 3.00 (**PBoC 1-year LPR, used as a proxy**) | 300 | 360 | 20 Sep 2026 fixing (unchanged since May 2025) | https://news.10jqka.com.cn/20260920/c680091504.shtml (reports the PBoC-authorised NIFC release); NIFC page: https://www.chinamoney.com.cn/english/bmklpr/ | Medium. Value from domestic press quoting the official release; the NIFC page shows the rate only as an image. LPR is an onshore CNY lending benchmark, not an offshore CNH deposit rate, so it is a proxy. |
| MXN | 6.50 (target overnight interbank rate) | 650 | 360 | 24 Sep 2026 decision (hold, unanimous) | https://www.banxico.org.mx/publicaciones-y-prensa/anuncios-de-las-decisiones-de-politica-monetaria/anuncios-politica-monetaria-t.html | High. Official Banxico announcement list. |
| BRL | 13.75 (Selic target) | 1375 | 365 ² | Copom 16 Sep 2026; valid until the 3–4 Nov 2026 meeting | https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/3?formato=json | High. Official BCB SGS series 432 (Selic target). The series is forward-filled to the next meeting, so its row dates read November; the decision date is 16 Sep. |
| ZAR | 7.25 (SARB policy rate, formerly "repo rate") | 725 | 365 | Announced 23 Sep 2026, effective 25 Sep 2026 | https://www.resbank.co.za/en/home/publications/publication-detail-pages/statements/monetary-policy-statements/2026/september | High. Official MPC statement. |
| INR | 5.50 (policy repo rate) | 550 | 365 | MPC 7 Oct 2026 | https://www.rbi.org.in/ | High. RBI homepage shows 5.50%, Governor's statement dated 7 Oct 2026. |
| XAU | 0.50 (**assumption**) | 50 | 360 | n/a | none (see note) | **UNVERIFIED.** No reliable public current gold lease rate found. Most recent figure found: 1-month gold lease 4.5% on 3 Feb 2025 (BullionVault, via secondary reports). We seed 50 bps as an admin-set placeholder. It is not a market observation. |
| XAG | 1.00 (**assumption**) | 100 | 360 | n/a | none (see note) | **UNVERIFIED.** Most recent figure found: silver lease rates spiked to ~39% in Oct 2025 and were back to roughly 2–3% by mid-Q1 2026, per a Kitco opinion piece dated 23 Apr 2026 (https://www.kitco.com/opinion/2026-04-23/londons-silver-running-out-room), which also says the normal level is below 1%. We seed 100 bps as an admin-set placeholder. It is not a market observation. |

## Notes

¹ **USD rounding.** The midpoint of 3.75–4.00% is 3.875% = 387.5 bps, which is not an integer. We round half up to **388 bps** and seed that. (For reference, interest on reserve balances is 3.90%, effective 17 Sep 2026, same press release.)

² **BRL day count.** Brazil quotes Selic on a 252-business-day basis. We simplify to 365 (spec §3). This understates the BRL carry slightly over short tenors; it is documented, not hidden.

**Metals.** For XAU/USD and XAG/USD the forward uses the lease rate in place of the base-currency deposit rate: `F = S × (1 + r_USD·t/360) / (1 + r_lease·t/360)`. With the placeholder values the gold forward sits above spot by roughly (3.875% − 0.50%) × t, and silver by roughly (3.875% − 1.00%) × t. Because the lease values are assumptions, the app labels them "assumed lease rate" next to the metals forwards. GAU/TRY (gram gold) uses the TRY rate on the quote side and the XAU lease rate on the base side.

**What the TRY rate means for the demo.** With TRY at 3700 bps and USD at 388 bps, the 90-day USD/TRY forward is about `S × (1 + 0.37·90/365) / (1 + 0.03875·90/360)` ≈ S × 1.0808, i.e. roughly 8.1% above spot (about 53.10 against the TCMB indicative 49.13 of 9 Oct 2026). That gap is the carry the Advisor shows the freelancer.

## Seed table (copy into the init script)

```
USD 388  360
TRY 3700 365
EUR 250  360
GBP 375  365
CHF 0    360
JPY 125  360
CNH 300  360
MXN 650  360
BRL 1375 365
ZAR 725  365
INR 550  365
XAU 50   360
XAG 100  360
```
