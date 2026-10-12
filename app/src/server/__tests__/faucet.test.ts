// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { clientIp, createFaucet, FAUCET_WINDOW_MS, NEED_SOL_MESSAGE } from "../faucet";

const key = () => Keypair.generate().publicKey.toBase58();
const funded = async () => LAMPORTS_PER_SOL; // 1 SOL
const quiet = () => {};

describe("faucet route handler", () => {
  it("mints once per wallet per 10 minutes", async () => {
    let t = 1_000_000;
    const mintTo = vi.fn(async () => "sig-ok");
    const f = createFaucet({ mintTo, getLamports: funded, now: () => t });
    const owner = key();

    expect(await f.handle({ owner }, "1.1.1.1")).toMatchObject({ status: 200, body: { signature: "sig-ok", amount: 1000 } });
    t += FAUCET_WINDOW_MS - 1;
    const again = await f.handle({ owner }, "2.2.2.2");
    expect(again.status).toBe(429);
    expect(String(again.body.error)).toMatch(/This wallet/);
    expect((await f.handle({ owner: key() }, "3.3.3.3")).status).toBe(200); // other wallet, other IP
    t += 1;
    expect((await f.handle({ owner }, "4.4.4.4")).status).toBe(200);
    expect(mintTo).toHaveBeenCalledTimes(3);
  });

  it("requires the owner to exist on chain with at least 0.01 SOL", async () => {
    const balances: Record<string, number | null> = {};
    const f = createFaucet({ mintTo: async () => "sig", getLamports: async (o) => balances[o.toBase58()] ?? null });
    const ghost = key();
    const r = await f.handle({ owner: ghost }, "1.1.1.1");
    expect(r.status).toBe(403);
    expect(r.body.error).toBe(NEED_SOL_MESSAGE);
    expect(String(r.body.error)).toMatch(/faucet\.solana\.com/);
    const poor = key();
    balances[poor] = 0.0099 * LAMPORTS_PER_SOL;
    expect((await f.handle({ owner: poor }, "1.1.1.1")).status).toBe(403);
    balances[poor] = 0.01 * LAMPORTS_PER_SOL;
    expect((await f.handle({ owner: poor }, "1.1.1.1")).status).toBe(200);
  });

  it("limits each client IP to one request per 10 minutes", async () => {
    let t = 0;
    const f = createFaucet({ mintTo: async () => "sig", getLamports: funded, now: () => t });
    expect((await f.handle({ owner: key() }, "9.9.9.9")).status).toBe(200);
    const r = await f.handle({ owner: key() }, "9.9.9.9");
    expect(r.status).toBe(429);
    expect(String(r.body.error)).toMatch(/this network/);
    expect((await f.handle({ owner: key() }, "8.8.8.8")).status).toBe(200);
    t += FAUCET_WINDOW_MS;
    expect((await f.handle({ owner: key() }, "9.9.9.9")).status).toBe(200);
  });

  it("caps successful requests per rolling hour across all wallets and IPs", async () => {
    let t = 0;
    const f = createFaucet({ mintTo: async () => "sig", getLamports: funded, now: () => t, globalCapPerHour: 3 });
    for (let i = 0; i < 3; i++) expect((await f.handle({ owner: key() }, `10.0.0.${i}`)).status).toBe(200);
    const r = await f.handle({ owner: key() }, "10.0.0.9");
    expect(r.status).toBe(429);
    expect(String(r.body.error)).toMatch(/hourly allowance/);
    t += 60 * 60_000;
    expect((await f.handle({ owner: key() }, "10.0.0.9")).status).toBe(200);
  });

  it("takes the first x-forwarded-for hop as the client IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("rejects a bad owner, frees the slots and hides details when minting fails", async () => {
    const log = vi.fn();
    const f = createFaucet({ mintTo: async () => { throw new Error("rpc down: secret detail"); }, getLamports: funded, log });
    expect((await f.handle({ owner: "not-a-key" })).status).toBe(400);
    expect((await f.handle(null)).status).toBe(400);
    const owner = key();
    const r = await f.handle({ owner }, "1.1.1.1");
    expect(r.status).toBe(502);
    expect(String(r.body.error)).not.toMatch(/secret detail/);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/secret detail/));
    expect((await f.handle({ owner }, "1.1.1.1")).status).toBe(502); // not rate-limited after a failure
    void quiet;
  });
});
