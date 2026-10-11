import { DEMO_ONLY_FEEDS, FEEDS, refDateToSec, type FeedKey } from "./markets";

/** One price input. `source` says whether it is a live Pyth print or the ECB daily reference. */
export interface LivePrice {
  price: number;
  publishTime: number;
  source: "pyth" | "ecb-ref";
}

export interface LiveSnapshot {
  ok: boolean;
  /** which upstream answered: Pyth Hermes (key set) or the ECB reference fallback */
  provider: "pyth" | "ecb" | "none";
  prices: Partial<Record<FeedKey, LivePrice>>;
  checkedAt: number;
  note: string;
}

interface HermesParsed {
  id: string;
  price: { price: string; expo: number; publish_time: number; conf?: string };
}

/** Hermes returns ids without the 0x prefix; price = price × 10^expo. */
export function parseHermes(json: unknown): Partial<Record<FeedKey, LivePrice>> {
  const parsed = (json as { parsed?: HermesParsed[] } | null)?.parsed ?? [];
  const byId = new Map<string, FeedKey>(Object.entries(FEEDS).map(([k, id]) => [id, k as FeedKey]));
  const out: Partial<Record<FeedKey, LivePrice>> = {};
  for (const p of parsed) {
    const key = byId.get(p.id.replace(/^0x/, "").toLowerCase());
    if (!key) continue;
    const price = Number(p.price.price) * Math.pow(10, p.price.expo);
    if (Number.isFinite(price) && price > 0) out[key] = { price, publishTime: p.price.publish_time, source: "pyth" };
  }
  return out;
}

export function hermesUrl(base = "https://hermes.pyth.network"): string {
  const qs = Object.values(FEEDS).map((id) => `ids[]=${id}`).join("&");
  return `${base.replace(/\/$/, "")}/v2/updates/price/latest?${qs}&parsed=true&encoding=hex`;
}

export const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=TRY,EUR,GBP,CHF,JPY,CNY,MXN,BRL,ZAR,INR";

/**
 * Frankfurter (ECB reference rates) → feed prices. Values are units per 1 USD,
 * so EUR/USD and GBP/USD invert; USD/CNH uses CNY as a labelled proxy.
 * Metals are not covered and stay demo.
 */
export function parseFrankfurter(json: unknown): Partial<Record<FeedKey, LivePrice>> {
  const body = json as { date?: string; rates?: Record<string, number> } | null;
  const r = body?.rates;
  if (!r || !body?.date) return {};
  const publishTime = refDateToSec(body.date);
  const map: Partial<Record<FeedKey, number | undefined>> = {
    "USD/TRY": r.TRY,
    "EUR/USD": r.EUR ? 1 / r.EUR : undefined,
    "GBP/USD": r.GBP ? 1 / r.GBP : undefined,
    "USD/CHF": r.CHF,
    "USD/JPY": r.JPY,
    "USD/CNH": r.CNY,
    "USD/MXN": r.MXN,
    "USD/BRL": r.BRL,
    "USD/ZAR": r.ZAR,
    "USD/INR": r.INR,
  };
  const out: Partial<Record<FeedKey, LivePrice>> = {};
  for (const [k, v] of Object.entries(map) as [FeedKey, number | undefined][]) {
    if (DEMO_ONLY_FEEDS.includes(k)) continue;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = { price: v, publishTime, source: "ecb-ref" };
  }
  return out;
}

/** Client side: ask our own route handler (keeps any Pyth API key server-side). */
export async function fetchLive(timeoutMs = 5000): Promise<LiveSnapshot> {
  const checkedAt = Math.floor(Date.now() / 1000);
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return { ok: false, provider: "none", prices: {}, checkedAt, note: "No price fetch during the server render." };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/prices", { signal: ctrl.signal, cache: "no-store" });
    const body = (await res.json()) as { ok: boolean; provider?: "pyth" | "ecb"; prices?: Partial<Record<FeedKey, LivePrice>>; note?: string };
    const prices = body.prices ?? {};
    const ok = body.ok && Object.keys(prices).length > 0;
    return { ok, provider: ok ? (body.provider ?? "none") : "none", prices, checkedAt, note: body.note ?? (ok ? "Prices updated" : "Price feed unavailable") };
  } catch {
    return { ok: false, provider: "none", prices: {}, checkedAt, note: "Price feed unreachable — showing the seeded reference rates." };
  } finally {
    clearTimeout(t);
  }
}
