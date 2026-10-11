import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ewma } from '../src/advisor';

const BASE = 'https://benchmarks.pyth.network/v1/shims/tradingview/history';
const SYMBOLS: Record<string, string> = {
  'USD/TRY': 'FX.USD/TRY', 'EUR/USD': 'FX.EUR/USD', 'GBP/USD': 'FX.GBP/USD', 'USD/CHF': 'FX.USD/CHF',
  'USD/JPY': 'FX.USD/JPY', 'USD/CNH': 'FX.USD/CNH', 'USD/MXN': 'FX.USD/MXN', 'USD/BRL': 'FX.USD/BRL',
  'USD/ZAR': 'FX.USD/ZAR', 'USD/INR': 'FX.USD/INR', 'XAU/USD': 'Metal.XAU/USD', 'XAG/USD': 'Metal.XAG/USD',
};
const OZ_GRAM = 31.1034768;
type Series = Map<number, number>; // day index -> close

async function fetchSeries(sym: string): Promise<Series> {
  const now = Math.floor(Date.now() / 1000);
  const url = `${BASE}?symbol=${encodeURIComponent(sym)}&resolution=D&from=${now - 400 * 86400}&to=${now}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${sym}: HTTP ${res.status}`);
  const j = (await res.json()) as { s?: string; t: number[]; c: number[] };
  if (!j.t?.length) throw new Error(`${sym}: empty response`);
  return new Map(j.t.map((t, i) => [Math.floor(t / 86400), j.c[i]]));
}

function combine(a: Series, b: Series, f: (x: number, y: number) => number): Series {
  const out: Series = new Map();
  for (const [d, x] of a) { const y = b.get(d); if (y !== undefined) out.set(d, f(x, y)); }
  return out;
}

function stats(s: Series, asOf: string) {
  const closes = [...s.entries()].sort((x, y) => x[0] - y[0]).map(([, c]) => c);
  const r = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  return { sigmaAnnual: +ewma(r).toFixed(4), driftAnnual: +(mean * 252).toFixed(4), asOf };
}

async function main() {
  const S: Record<string, Series> = {};
  for (const [k, sym] of Object.entries(SYMBOLS)) S[k] = await fetchSeries(sym);
  S['EUR/TRY'] = combine(S['EUR/USD'], S['USD/TRY'], (a, b) => a * b);
  S['GBP/TRY'] = combine(S['GBP/USD'], S['USD/TRY'], (a, b) => a * b);
  S['GAU/TRY'] = combine(S['XAU/USD'], S['USD/TRY'], (a, b) => (a * b) / OZ_GRAM);
  const asOf = new Date().toISOString().slice(0, 10);
  const vol = Object.fromEntries(Object.entries(S).map(([k, s]) => [k, stats(s, asOf)]));
  const out = fileURLToPath(new URL('../src/vol.json', import.meta.url));
  writeFileSync(out, JSON.stringify({ source: 'pyth-benchmarks', vol }, null, 2) + '\n');
  console.log(`wrote ${Object.keys(vol).length} entries to ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
