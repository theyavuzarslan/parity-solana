import { FEEDS, type FeedKey } from "./markets";

export interface LivePrice {
  price: number;
  publishTime: number;
}

export interface LiveSnapshot {
  ok: boolean;
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
    if (Number.isFinite(price) && price > 0) out[key] = { price, publishTime: p.price.publish_time };
  }
  return out;
}

export function hermesUrl(base = "https://hermes.pyth.network"): string {
  const qs = Object.values(FEEDS).map((id) => `ids[]=${id}`).join("&");
  return `${base.replace(/\/$/, "")}/v2/updates/price/latest?${qs}&parsed=true&encoding=hex`;
}

/** Client side: ask our own route handler (keeps any Hermes API key server-side). */
export async function fetchLive(timeoutMs = 4000): Promise<LiveSnapshot> {
  const checkedAt = Math.floor(Date.now() / 1000);
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return { ok: false, prices: {}, checkedAt, note: "No live feed on the server render." };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/prices", { signal: ctrl.signal, cache: "no-store" });
    const body = (await res.json()) as { ok: boolean; prices?: Partial<Record<FeedKey, LivePrice>>; note?: string };
    const prices = body.prices ?? {};
    const ok = body.ok && Object.keys(prices).length > 0;
    return { ok, prices, checkedAt, note: body.note ?? (ok ? "Pyth Hermes" : "Live feed unavailable") };
  } catch {
    return { ok: false, prices: {}, checkedAt, note: "Live feed unreachable — showing demo spots." };
  } finally {
    clearTimeout(t);
  }
}
