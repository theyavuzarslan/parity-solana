// Price relay (default devnet price mode). Keeps demo_mode ON and every RELAY_INTERVAL_MS (10 s)
// calls set_demo_price for all 15 markets with reference prices:
//   1. Pyth Hermes (latest, parsed) when PYTH_API_KEY is set (Authorization: Bearer <key>);
//   2. else Frankfurter ECB reference rates (daily; CNY used as a proxy for CNH)
//      + a STATIC, clearly labelled reference for XAU/USD and XAG/USD (env XAU_USD_REF / XAG_USD_REF).
// This is the honest devnet fallback: "devnet: admin-relayed reference prices; production reads Pyth on-chain".
//
// set_demo_price takes feed-level prices at 1e8 (feed A, feed B), not the composed spot.
// Shock: SHOCK_USDTRY="+12%" (or the file keys/shock-usdtry containing e.g. "+8.5%", re-read every tick)
// multiplies the USD/TRY feed wherever it is used (USD/TRY, EUR/TRY, GBP/TRY, GAU/TRY).
// ONCE=1 runs a single tick and exits.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Transaction } from "@solana/web3.js";
import { BN, CLUSTER, KEYS, configPda, demoPda, deployer, program } from "./env.js";
import { FEEDS, MARKETS, type FeedKey } from "./markets.js";

const INTERVAL = Number(process.env.RELAY_INTERVAL_MS ?? 10_000);
const XAU_REF = Number(process.env.XAU_USD_REF ?? 4000);
const XAG_REF = Number(process.env.XAG_USD_REF ?? 48);

export type Quotes = { source: string; prices: Partial<Record<FeedKey, number>> };

export const HERMES_STALE_SECS = 120;

/** Hermes latest prices. Feeds that are absent are left out (the caller fills them from the fallback);
 *  feeds older than HERMES_STALE_SECS are kept but warned about (FX closes at weekends). */
export async function fromHermes(apiKey: string, warn: (m: string) => void = console.warn): Promise<Quotes> {
  const qs = Object.values(FEEDS).map((id) => `ids[]=${id}`).join("&");
  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${qs}&parsed=true`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`hermes ${res.status}`);
  const j: any = await res.json();
  return parseHermes(j, Math.floor(Date.now() / 1000), warn);
}

export function parseHermes(j: any, nowSecs: number, warn: (m: string) => void = console.warn): Quotes {
  const byId = new Map<string, any>((j.parsed ?? []).map((p: any) => [String(p.id).replace(/^0x/, ""), p.price]));
  const prices: Quotes["prices"] = {};
  let oldest = Infinity;
  for (const [k, id] of Object.entries(FEEDS) as [FeedKey, string][]) {
    const p = byId.get(id);
    if (!p) continue;
    prices[k] = Number(p.price) * 10 ** Number(p.expo);
    const age = nowSecs - Number(p.publish_time);
    if (age > HERMES_STALE_SECS) warn(`[relay] WARN hermes ${k} publish_time is ${age}s old (> ${HERMES_STALE_SECS}s; market closed?)`);
    oldest = Math.min(oldest, Number(p.publish_time));
  }
  const age = Number.isFinite(oldest) ? `${Math.round(nowSecs - oldest)}s` : "n/a";
  return { source: `pyth-hermes (oldest publish ${age} ago)`, prices };
}

/** Fill feeds missing from `primary` with `fallback`, naming them in the source label. */
export function mergeQuotes(primary: Quotes, fallback: Quotes): Quotes {
  const missing = (Object.keys(FEEDS) as FeedKey[]).filter((k) => primary.prices[k] === undefined && fallback.prices[k] !== undefined);
  if (missing.length === 0) return primary;
  const prices = { ...primary.prices };
  for (const k of missing) prices[k] = fallback.prices[k];
  return { source: `${primary.source} + fallback[${missing.join(",")}] from ${fallback.source}`, prices };
}

let fxCache: { at: number; q: Quotes } | undefined;
export async function fromFrankfurter(): Promise<Quotes> {
  if (fxCache && Date.now() - fxCache.at < 10 * 60_000) return fxCache.q;
  const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=TRY,EUR,GBP,CHF,JPY,CNY,MXN,BRL,ZAR,INR");
  if (!res.ok) throw new Error(`frankfurter ${res.status}`);
  const j: any = await res.json();
  const r = j.rates; // units per USD
  const q: Quotes = {
    source: `frankfurter-ecb ${j.date} + STATIC metals (XAU ${XAU_REF}, XAG ${XAG_REF}; not live)`,
    prices: {
      USD_TRY: r.TRY, EUR_USD: 1 / r.EUR, GBP_USD: 1 / r.GBP, USD_CHF: r.CHF, USD_JPY: r.JPY,
      USD_CNH: r.CNY, USD_MXN: r.MXN, USD_BRL: r.BRL, USD_ZAR: r.ZAR, USD_INR: r.INR,
      XAU_USD: XAU_REF, XAG_USD: XAG_REF,
    },
  };
  fxCache = { at: Date.now(), q };
  return q;
}

/** "+12%", "-5", "8.5%" -> multiplier. Empty -> 1. Invalid -> warn and 1 (never kills the relay). */
export function parseShock(s: string | undefined, warn: (m: string) => void = console.warn): number {
  if (!s || !s.trim()) return 1;
  const m = s.trim().match(/^([+-]?\d+(?:\.\d+)?)%?$/);
  const f = m ? 1 + Number(m[1]) / 100 : NaN;
  if (!Number.isFinite(f) || f <= 0) {
    warn(`[relay] WARN ignoring bad shock "${s}" (use e.g. +12%); using no shock`);
    return 1;
  }
  return f;
}
function currentShock(): number {
  const f = join(KEYS, "shock-usdtry");
  const fileVal = existsSync(f) ? readFileSync(f, "utf8").trim() : "";
  return parseShock(fileVal || process.env.SHOCK_USDTRY);
}

export const e8 = (x: number) => BigInt(Math.round(x * 1e8));

async function getQuotes(): Promise<Quotes> {
  const key = process.env.PYTH_API_KEY;
  if (key) {
    let h: Quotes | undefined;
    try { h = await fromHermes(key); } catch (e) { console.warn(`hermes failed (${(e as Error).message}); falling back`); }
    if (h) {
      const complete = (Object.keys(FEEDS) as FeedKey[]).every((k) => h!.prices[k] !== undefined);
      if (complete) return h;
      try { return mergeQuotes(h, await fromFrankfurter()); }
      catch (e) { console.warn(`fallback for missing hermes feeds failed (${(e as Error).message})`); return h; }
    }
  }
  return fromFrankfurter();
}

async function tick(p: any, admin: any) {
  const q = await getQuotes();
  const shock = currentShock();
  const px = { ...q.prices };
  if (shock !== 1 && px.USD_TRY) px.USD_TRY *= shock;

  const demo: any = await p.account.demoState.fetch(demoPda());
  const ixs = [];
  const changed: string[] = [];
  for (const mk of MARKETS) {
    const a = px[mk.feedAKey], b = mk.feedBKey ? px[mk.feedBKey] : 0;
    if (!a || (mk.feedBKey && !b)) { console.warn(`  no price for ${mk.symbol}`); continue; }
    const A = e8(a), B = mk.feedBKey ? e8(b!) : 0n;
    const cur = demo.prices[mk.id];
    if (cur.set && BigInt(cur.a.toString()) === A && BigInt(cur.b.toString()) === B) continue;
    changed.push(mk.symbol);
    ixs.push(await p.methods.setDemoPrice(mk.id, new BN(A.toString()), new BN(B.toString()), true)
      .accountsPartial({ config: configPda(), admin: admin.publicKey, demoState: demoPda() }).instruction());
  }
  const shockTxt = shock !== 1 ? ` SHOCK USD/TRY x${shock.toFixed(4)}` : "";
  const usdtry = px.USD_TRY?.toFixed(4);
  if (ixs.length === 0) {
    console.log(`[relay] ${new Date().toISOString()} source=${q.source}${shockTxt} USD/TRY=${usdtry} unchanged`);
    return;
  }
  const sig = await sendBatch(p, ixs);
  console.log(`[relay] ${new Date().toISOString()} source=${q.source}${shockTxt} USD/TRY=${usdtry} set ${changed.length} markets  ${sig}`);
}

async function sendBatch(p: any, ixs: any[]): Promise<string> {
  const tx = new Transaction().add(...ixs);
  return p.provider.sendAndConfirm(tx, []);
}

async function main() {
  const admin = deployer();
  const p = program(admin);
  console.log(`[relay] cluster=${CLUSTER} interval=${INTERVAL}ms mode=${process.env.PYTH_API_KEY ? "hermes(key)" : "frankfurter+static-metals"}`);
  const cfg: any = await p.account.config.fetch(configPda());
  if (!cfg.demoMode) {
    const sig = await p.methods.setDemoMode(true)
      .accountsPartial({ config: configPda(), admin: admin.publicKey, demoState: demoPda() }).rpc();
    console.log(`[relay] demo_mode ON  ${sig}`);
  }
  for (;;) {
    try { await tick(p, admin); } catch (e) { console.error(`[relay] tick failed: ${(e as Error).message}`); }
    if (process.env.ONCE) return;
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
