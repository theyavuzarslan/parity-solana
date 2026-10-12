// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { devRefusal, foreignProgram } from "../devWallet";

const req = (url = "http://localhost:3400/api/dev/wallet", host = "localhost:3400") => new Request(url, { headers: { host } });
const ok = { PARITY_DEV_WALLET: "1", NODE_ENV: "development" };

describe("dev wallet request-time guard", () => {
  it("allows only opt-in + not Vercel + not production + localhost", () => {
    expect(devRefusal(req(), ok)).toBeNull();
    expect(devRefusal(req("http://127.0.0.1:3400/x", "127.0.0.1:3400"), ok)).toBeNull();
  });

  it.each([
    ["opt-in missing", { NODE_ENV: "development" }],
    ["opt-in not exactly 1", { PARITY_DEV_WALLET: "true", NODE_ENV: "development" }],
    ["on Vercel", { ...ok, VERCEL: "1" }],
    ["production", { ...ok, NODE_ENV: "production" }],
    ["NEXT_PUBLIC_CLUSTER=localnet alone is not enough", { NEXT_PUBLIC_CLUSTER: "localnet", NODE_ENV: "development" }],
    ["everything set but on Vercel in production", { ...ok, VERCEL: "1", NODE_ENV: "production" }],
  ])("refuses: %s", (_name, env) => {
    expect(devRefusal(req(), env as Record<string, string>)).not.toBeNull();
  });

  it("refuses a non-local Host header or URL", () => {
    expect(devRefusal(req("http://localhost:3400/x", "evil.example"), ok)).toMatch(/localhost/);
    expect(devRefusal(req("http://evil.example/x", "localhost:3400"), ok)).toMatch(/localhost/);
  });
});

describe("dev wallet program allow-list", () => {
  const payer = Keypair.generate().publicKey;
  const parity = new PublicKey("55jabap7VG6LKKJtidxVRBuLaLzFz6P96uPUicR2e4EQ");
  it("signs only Parity / System / Token / Token-2022 / ATA / Compute Budget instructions", () => {
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1 }),
      SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 1 }),
      new TransactionInstruction({ programId: parity, keys: [], data: Buffer.alloc(0) }),
    );
    expect(foreignProgram(tx)).toBeNull();
    const evil = Keypair.generate().publicKey;
    tx.add(new TransactionInstruction({ programId: evil, keys: [], data: Buffer.alloc(0) }));
    expect(foreignProgram(tx)).toBe(evil.toBase58());
  });
});
