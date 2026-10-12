// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as web3 from "@solana/web3.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { ACCOUNT_SIZE, AccountLayout, AccountState, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { resolvePayout } from "shared/src/payout";

// The app's Dispatch crank and the keeper both call shared/src/payout.ts#resolvePayout.
const mint = Keypair.generate().publicKey;
const owner = Keypair.generate().publicKey;
const payer = Keypair.generate().publicKey;
const ata = getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID);

function tokenAccount(acctOwner: PublicKey) {
  const data = Buffer.alloc(ACCOUNT_SIZE);
  AccountLayout.encode({
    mint, owner: acctOwner, amount: 0n, delegateOption: 0, delegate: PublicKey.default, state: AccountState.Initialized,
    isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default,
  }, data);
  return { data, owner: TOKEN_PROGRAM_ID, lamports: 2_039_280, executable: false, rentEpoch: 0 };
}
const conn = (info: unknown) => ({ getAccountInfo: async () => info, getMinimumBalanceForRentExemption: async () => 2_039_280 });

describe("resolvePayout (shared by keeper and app crank)", () => {
  it("missing canonical ATA -> idempotent create, paid by the caller", async () => {
    const r = await resolvePayout({ web3, spl }, conn(null), payer, owner, mint, TOKEN_PROGRAM_ID);
    expect(r.note).toBe("create-ata");
    expect(r.address.equals(ata)).toBe(true);
    expect(r.ixs).toHaveLength(1);
    expect(r.signers).toHaveLength(0);
  });

  it("usable ATA owned by the party -> use it, no instructions", async () => {
    const r = await resolvePayout({ web3, spl }, conn(tokenAccount(owner)), payer, owner, mint, TOKEN_PROGRAM_ID);
    expect(r.note).toBe("ata");
    expect(r.ixs).toHaveLength(0);
  });

  it("ATA owner reassigned -> fresh party-owned account created in the same tx", async () => {
    const r = await resolvePayout({ web3, spl }, conn(tokenAccount(Keypair.generate().publicKey)), payer, owner, mint, TOKEN_PROGRAM_ID);
    expect(r.note).toBe("fresh-account");
    expect(r.signers).toHaveLength(1);
    expect(r.address.equals(r.signers[0].publicKey)).toBe(true);
    expect(r.ixs).toHaveLength(2); // system create + InitializeAccount3(owner)
  });
});
