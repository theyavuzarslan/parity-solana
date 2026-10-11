const nf = (min: number, max = min) => new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

export const fmtNum = (n: number, dp = 2) => nf(dp).format(n);

export const fmtPrice = (n: number, dp = 4) => nf(dp).format(n);

export const fmtUsd = (n: number, dp = 2) => `$${nf(dp).format(Math.abs(n))}`;

export const fmtTry = (n: number, dp = 0) => `₺${nf(dp).format(n)}`;

/** "+$12.40 gain" / "−$8.10 loss" / "$0.00 flat" — sign and word, never colour alone. */
export function fmtPnl(n: number): { text: string; word: "gain" | "loss" | "flat"; sign: "+" | "−" | "" } {
  const r = Math.round(n * 100) / 100;
  if (r > 0) return { text: `+${fmtUsd(r)}`, word: "gain", sign: "+" };
  if (r < 0) return { text: `−${fmtUsd(r)}`, word: "loss", sign: "−" };
  return { text: fmtUsd(0), word: "flat", sign: "" };
}

export const fmtPct = (n: number, dp = 2, signed = false) => `${signed && n > 0 ? "+" : n < 0 ? "−" : ""}${nf(dp).format(Math.abs(n))}%`;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** "12 JAN 2027" from unix seconds (UTC). */
export function fmtDate(sec: number): string {
  const d = new Date(sec * 1000);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtAge(sec: number, nowSec = Math.floor(Date.now() / 1000)): string {
  const a = Math.max(0, nowSec - sec);
  if (a < 90) return `${a} s ago`;
  if (a < 5400) return `${Math.round(a / 60)} min ago`;
  if (a < 172800) return `${Math.round(a / 3600)} h ago`;
  return `${Math.round(a / 86400)} days ago`;
}

export const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
