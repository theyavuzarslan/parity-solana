import { describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

// The keeper's resolvePayout must be the shared implementation (the app's Dispatch crank uses it too).
const shared = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("../../shared/src/payout.js", async (orig) => {
  const real: any = await orig();
  return { ...real, resolvePayout: (...args: unknown[]) => { shared.calls.push(args); return real.resolvePayout(...args); } };
});
vi.mock("../src/env.js", async (orig) => {
  const real: any = await orig();
  return { ...real, connection: { getAccountInfo: async () => null, getMinimumBalanceForRentExemption: async () => 0 } };
});

describe("keeper resolvePayout", () => {
  it("delegates to shared/src/payout.ts with the keeper's connection", async () => {
    const { resolvePayout } = await import("../src/keeper.js");
    const [payer, owner, mint] = [0, 1, 2].map(() => Keypair.generate().publicKey);
    const r = await resolvePayout(payer, owner, mint, TOKEN_PROGRAM_ID);
    expect(shared.calls).toHaveLength(1);
    expect(r.note).toBe("create-ata");
    expect(r.address.equals(getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID))).toBe(true);
  });
});
