/**
 * Client-side record of Dispatch shocks on chain. The multiplier shown in Dispatch is only true while
 * the market's DemoState slot still holds the value the shock wrote: once the relay rewrites it, a
 * Reset clears it, or demo mode is turned off, the shock is gone and its multiplier must be dropped.
 */
export type DemoSlot = { a: bigint; b: bigint; set: boolean };
export type ShockedSlot = { a: bigint; b: bigint };

/**
 * Drops (in place) every shock whose slot no longer matches the value written by the shock.
 * `slotOf` maps a market key to its on-chain DemoState slot. Returns the keys that were dropped.
 */
export function pruneShocks<K extends string>(
  shocks: Partial<Record<K, number>>,
  written: Partial<Record<K, ShockedSlot>>,
  slotOf: (key: K) => DemoSlot | undefined,
): K[] {
  const dropped: K[] = [];
  for (const key of Object.keys(shocks) as K[]) {
    const w = written[key];
    const slot = slotOf(key);
    if (!w || !slot || !slot.set || slot.a !== w.a || slot.b !== w.b) {
      delete shocks[key];
      delete written[key];
      dropped.push(key);
    }
  }
  return dropped;
}
