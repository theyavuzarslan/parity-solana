// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { createFaucet, FAUCET_WINDOW_MS } from "../faucet";

describe("faucet route handler", () => {
  it("mints once per wallet per 10 minutes", async () => {
    let t = 1_000_000;
    const mintTo = vi.fn(async () => "sig-ok");
    const f = createFaucet({ mintTo, now: () => t });
    const owner = Keypair.generate().publicKey.toBase58();

    expect(await f.handle({ owner })).toMatchObject({ status: 200, body: { signature: "sig-ok", amount: 1000 } });
    t += FAUCET_WINDOW_MS - 1;
    const again = await f.handle({ owner });
    expect(again.status).toBe(429);
    expect(String(again.body.error)).toMatch(/Try again/);
    // another wallet is not limited
    expect((await f.handle({ owner: Keypair.generate().publicKey.toBase58() })).status).toBe(200);
    t += 1;
    expect((await f.handle({ owner })).status).toBe(200);
    expect(mintTo).toHaveBeenCalledTimes(3);
  });

  it("rejects a bad owner and frees the slot when minting fails", async () => {
    const f = createFaucet({ mintTo: async () => { throw new Error("rpc down"); } });
    expect((await f.handle({ owner: "not-a-key" })).status).toBe(400);
    expect((await f.handle(null)).status).toBe(400);
    const owner = Keypair.generate().publicKey.toBase58();
    expect((await f.handle({ owner })).status).toBe(502);
    expect((await f.handle({ owner })).status).toBe(502); // not rate-limited after a failure
  });
});
