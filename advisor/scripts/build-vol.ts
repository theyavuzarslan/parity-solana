import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ewma } from '../src/advisor';

const API = 'https://api.frankfurter.dev/v1';
type Series = Map<string, number>; // ISO date -> close
type Entry = { sigmaAnnual: number; driftAnnual: number; asOf: string; source: string };

// Metals have no free keyless source: labelled approximations (zero drift so they do not bias expectedSpot).
const METAL_FALLBACK = { 'XAU/USD': { sigmaAnnual: 0.18, driftAnnual: 0 }, 'XAG/USD': { sigmaAnnual: 0.3, driftAnnual: 0 } };

async function fetchRates(): Promise<Record<string, Record<string, number>>> {
  const to = new Date(); const from = new Date(Date.now() - 400 * 86400_000);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const url = `${API}/${d(from)}..${d(to)}?base=USD&symbols=TRY,EUR,GBP,CHF,JPY,CNY,MXN,BRL,ZAR,INR`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`frankfurter: HTTP ${res.status}`);
  const j = (await res.json()) as { rates: Record<string, Record<string, number>> };
  if (!j.rates || !Object.keys(j.rates).length) throw new Error('frankfurter: empty response');
  return j.rates;
}

function series(rates: Record<string, Record<string, number>>, f: (r: Record<string, number>) => number): Series {
  return new Map(Object.entries(rates).sort().map(([d, r]) => [d, f(r)]));
}

function stats(s: Series) {
  const closes = [...s.values()];
  const r = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  return { sigmaAnnual: +ewma(r).toFixed(4), driftAnnual: +(mean * 252).toFixed(4) };
}

async function main() {
  const rates = await fetchRates();
  const asOf = Object.keys(rates).sort().pop()!;
  const defs: Record<string, (r: Record<string, number>) => number> = {
    'USD/TRY': (r) => r.TRY, 'EUR/TRY': (r) => r.TRY / r.EUR, 'GBP/TRY': (r) => r.TRY / r.GBP,
    'EUR/USD': (r) => 1 / r.EUR, 'GBP/USD': (r) => 1 / r.GBP, 'USD/CHF': (r) => r.CHF, 'USD/JPY': (r) => r.JPY,
    'USD/CNH': (r) => r.CNY, // proxy: onshore CNY used for offshore CNH
    'USD/MXN': (r) => r.MXN, 'USD/BRL': (r) => r.BRL, 'USD/ZAR': (r) => r.ZAR, 'USD/INR': (r) => r.INR,
  };
  const vol: Record<string, Entry> = {};
  for (const [k, f] of Object.entries(defs)) vol[k] = { ...stats(series(rates, f)), asOf, source: k === 'USD/CNH' ? 'frankfurter-ecb (CNY proxy)' : 'frankfurter-ecb' };
  for (const [k, v] of Object.entries(METAL_FALLBACK)) vol[k] = { ...v, asOf: 'n/a', source: 'fallback' };
  // GAU/TRY = XAU/USD x USD/TRY / 31.1035: variances add (zero correlation assumed), drifts add.
  const x = vol['XAU/USD'], t = vol['USD/TRY'];
  vol['GAU/TRY'] = {
    sigmaAnnual: +Math.sqrt(x.sigmaAnnual ** 2 + t.sigmaAnnual ** 2).toFixed(4),
    driftAnnual: +(x.driftAnnual + t.driftAnnual).toFixed(4), asOf, source: 'frankfurter-ecb (USD/TRY) + fallback (XAU)',
  };
  for (const [k, e] of Object.entries(vol)) if (!Number.isFinite(e.sigmaAnnual) || !Number.isFinite(e.driftAnnual)) throw new Error(`non-finite vol for ${k}`);
  const out = fileURLToPath(new URL('../src/vol.json', import.meta.url));
  const note = 'FX from Frankfurter (ECB reference rates), ~400d daily log returns, EWMA lambda 0.94. USD/CNH uses CNY as proxy. XAU/USD and XAG/USD are approximate fallbacks (no free keyless source); GAU/TRY combines fallback XAU with real USD/TRY assuming zero correlation.';
  writeFileSync(out, JSON.stringify({ source: 'frankfurter-ecb', note, vol }, null, 2) + '\n');
  console.log(`wrote ${Object.keys(vol).length} entries to ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
