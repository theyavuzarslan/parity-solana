// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { clientIp, createFaucet, FAUCET_AMOUNT, FAUCET_WINDOW_MS, IP_LIMIT_PER_WINDOW, NEED_SOL_MESSAGE, NOT_CONFIGURED_MESSAGE } from "../faucet";

const key = () => Keypair.generate().publicKey.toBase58();
const funded = async () => LAMPORTS_PER_SOL; // 1 SOL
const quiet = () => {};

describe("faucet route handler", () => {
  it("mints once per wallet per 10 minutes", async () => {
    let t = 1_000_000;
    const mintTo = vi.fn(async () => "sig-ok");
    const f = createFaucet({ mintTo, getLamports: funded, now: () => t });
    const owner = key();

    expect(await f.handle({ owner }, "1.1.1.1")).toMatchObject({ status: 200, body: { signature: "sig-ok", amount: 10_000 } });
    expect(FAUCET_AMOUNT).toBe(10_000);
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

  it("limits each client IP to 5 requests per 10 minutes (any wallets)", async () => {
    let t = 0;
    const f = createFaucet({ mintTo: async () => "sig", getLamports: funded, now: () => t });
    expect(IP_LIMIT_PER_WINDOW).toBe(5);
    for (let i = 0; i < 5; i++) expect((await f.handle({ owner: key() }, "9.9.9.9")).status).toBe(200);
    const r = await f.handle({ owner: key() }, "9.9.9.9");
    expect(r.status).toBe(429);
    expect(String(r.body.error)).toMatch(/This network/);
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

describe("faucet under concurrent bursts", () => {
  const slowFunded = async () => { await new Promise((r) => setTimeout(r, 5)); return LAMPORTS_PER_SOL; };

  it("10 parallel requests for the same owner and IP -> exactly 1 succeeds", async () => {
    const mintTo = vi.fn(async () => { await new Promise((r) => setTimeout(r, 5)); return "sig"; });
    const f = createFaucet({ mintTo, getLamports: slowFunded });
    const owner = key();
    const replies = await Promise.all(Array.from({ length: 10 }, () => f.handle({ owner }, "7.7.7.7")));
    expect(replies.filter((r) => r.status === 200)).toHaveLength(1);
    expect(replies.filter((r) => r.status === 429)).toHaveLength(9);
    expect(mintTo).toHaveBeenCalledTimes(1);
  });

  it("10 parallel requests from one IP for different owners -> exactly 5 succeed", async () => {
    const f = createFaucet({ mintTo: async () => "sig", getLamports: slowFunded });
    const replies = await Promise.all(Array.from({ length: 10 }, () => f.handle({ owner: key() }, "7.7.7.8")));
    expect(replies.filter((r) => r.status === 200)).toHaveLength(5);
  });

  it("70 parallel different owners and IPs -> at most 60 succeed (global cap)", async () => {
    const mintTo = vi.fn(async () => "sig");
    const f = createFaucet({ mintTo, getLamports: slowFunded });
    const replies = await Promise.all(Array.from({ length: 70 }, (_, i) => f.handle({ owner: key() }, `10.1.0.${i}`)));
    const ok = replies.filter((r) => r.status === 200).length;
    expect(ok).toBeLessThanOrEqual(60);
    expect(ok).toBe(60);
    expect(mintTo).toHaveBeenCalledTimes(60);
  });

  it("a request refused for low SOL releases its slots (owner, IP and global)", async () => {
    let sol = 0;
    const f = createFaucet({ mintTo: async () => "sig", getLamports: async () => sol, globalCapPerHour: 1 });
    const owner = key();
    expect((await f.handle({ owner }, "5.5.5.5")).status).toBe(403);
    sol = LAMPORTS_PER_SOL;
    expect((await f.handle({ owner }, "5.5.5.5")).status).toBe(200); // same owner, same IP, cap 1 still free
  });

  it("a released request does not free a slot taken by a later request", async () => {
    let resolveFirst!: (v: number | null) => void;
    const calls: number[] = [];
    let t = 0;
    const f = createFaucet({
      mintTo: async () => "sig",
      now: () => t,
      ipLimit: 1,
      getLamports: async () => {
        calls.push(calls.length);
        if (calls.length === 1) return new Promise<number | null>((r) => { resolveFirst = r; });
        return LAMPORTS_PER_SOL;
      },
    });
    const first = f.handle({ owner: key() }, "6.6.6.6"); // holds the IP slot, waiting on balance
    t += FAUCET_WINDOW_MS; // window passes while the first is in flight
    const second = await f.handle({ owner: key() }, "6.6.6.6"); // takes the IP slot anew
    expect(second.status).toBe(200);
    resolveFirst(null); // first fails (no SOL) and releases — must not delete the second's slot
    expect((await first).status).toBe(403);
    expect((await f.handle({ owner: key() }, "6.6.6.6")).status).toBe(429);
  });
});

describe("faucet without configuration", () => {
  it("refuses with 503 before touching the network or the limits", async () => {
    const getLamports = vi.fn(async () => LAMPORTS_PER_SOL);
    const mintTo = vi.fn(async () => "sig");
    const f = createFaucet({ mintTo, getLamports, configured: () => false });
    const r = await f.handle({ owner: Keypair.generate().publicKey.toBase58() }, "7.7.7.7");
    expect(r).toEqual({ status: 503, body: { error: NOT_CONFIGURED_MESSAGE } });
    expect(getLamports).not.toHaveBeenCalled();
    expect(mintTo).not.toHaveBeenCalled();
  });
});
