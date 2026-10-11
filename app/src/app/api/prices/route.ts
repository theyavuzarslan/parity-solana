import { hermesUrl, parseHermes } from "@/data/pyth";

export const dynamic = "force-dynamic";

/**
 * Proxies Pyth Hermes latest prices for the 12 feeds. Set PYTH_HERMES_URL /
 * PYTH_API_KEY when the public endpoint requires a key; without them we
 * return ok:false and the app falls back to labelled demo spots.
 */
export async function GET() {
  const base = process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network";
  const key = process.env.PYTH_API_KEY;
  try {
    const res = await fetch(hermesUrl(base), {
      cache: "no-store",
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) {
      return Response.json({ ok: false, prices: {}, note: `Pyth Hermes answered ${res.status} — showing demo spots.` });
    }
    const prices = parseHermes(await res.json());
    return Response.json({ ok: true, prices, note: "Pyth Hermes" });
  } catch {
    return Response.json({ ok: false, prices: {}, note: "Pyth Hermes unreachable — showing demo spots." });
  }
}
