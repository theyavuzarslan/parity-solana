// Pure crank decision for one position. `status` accepts the Rust name (Open) or the Anchor
// TS enum key (open / partiallyLiquidated). Liquidation is only possible before maturity
// (the program rejects it afterwards), so a matured live position is only ever settled.
export type Crank = "settle" | "liquidate" | "mark";

const LIVE = new Set(["open", "called", "partiallyliquidated"]);

export function decide(p: { status: string; breachCount: number; confirmMarks: number; now: number; maturity: number }): Crank[] {
  if (!LIVE.has(p.status.toLowerCase())) return [];
  if (p.now >= p.maturity) return ["settle"];
  if (p.breachCount >= p.confirmMarks) return ["mark", "liquidate"];
  return ["mark"];
}
