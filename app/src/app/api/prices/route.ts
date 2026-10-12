import { FRANKFURTER_URL, hermesUrl, parseFrankfurter, parseHermes } from "@/data/pyth";

export const dynamic = "force-dynamic";

/**
 * Server-only price proxy.
 * - PYTH_API_KEY set → Pyth Hermes latest prices, `Authorization: Bearer <key>` (the key never reaches the client).
 * - Otherwise → ECB reference rates via Frankfurter (free, daily). Metals are not covered and stay demo.
 */
export async function GET() {
  const key = process.env.PYTH_API_KEY;
  if (key) {
    const base = process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network";
    try {
      const res = await fetch(hermesUrl(base), {
        cache: "no-store",
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const prices = parseHermes(await res.json());
        if (Object.keys(prices).length) return Response.json({ ok: true, provider: "pyth", prices, note: "Pyth Hermes" });
      }
      // fall through to the reference rates
    } catch {
      // fall through
    }
  }
  try {
    const res = await fetch(FRANKFURTER_URL, { cache: "no-store", signal: AbortSignal.timeout(3500) });
    if (!res.ok) return Response.json({ ok: false, provider: "ecb", prices: {}, note: `Reference rates answered ${res.status}.` });
    const json = (await res.json()) as { date?: string };
    const prices = parseFrankfurter(json);
    return Response.json({
      ok: Object.keys(prices).length > 0,
      provider: "ecb",
      prices,
      note: `ECB reference rate (daily), ${json.date ?? "date unknown"} — not a live feed.`,
    });
  } catch {
    return Response.json({ ok: false, provider: "ecb", prices: {}, note: "Reference rates unreachable." });
  }
}
