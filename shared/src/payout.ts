// Payout-account resolution for liquidate/settle, shared by the keeper (scripts/src/keeper.ts)
// and the app's Dispatch crank. liquidate/settle accept any token account of the mint owned by
// the party; Token-2022 accounts with RequiredMemoTransfers or CpiGuard are rejected on-chain.
//   - canonical ATA missing            -> create it idempotently (payer pays) and use it;
//   - ATA usable (owned by the party, right mint, no memo-required / CPI guard) -> use it;
//   - otherwise (owner reassigned, memo, CPI guard) -> create a fresh plain token account owned by
//     the party in the same tx (new keypair, system create + InitializeAccount3, payer pays).
//
// This package has no dependencies of its own (it is linked into the app and imported by the
// scripts), so callers inject their @solana/web3.js and @solana/spl-token modules.

/** The two library modules this function needs: `import * as web3`, `import * as spl`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PayoutLibs = { web3: any; spl: any };

export type PayoutNote = "create-ata" | "ata" | "fresh-account";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PayoutResult<PK = any, IX = any, KP = any> = { address: PK; ixs: IX[]; signers: KP[]; note: PayoutNote };

/** Minimal connection surface used here (web3.js Connection satisfies it). */
export interface PayoutConnection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAccountInfo(address: any, commitment?: any): Promise<any>;
  getMinimumBalanceForRentExemption(space: number): Promise<number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolvePayout(libs: PayoutLibs, connection: PayoutConnection, payer: any, owner: any, mint: any, tp: any): Promise<PayoutResult> {
  const { web3, spl } = libs;
  const ata = spl.getAssociatedTokenAddressSync(mint, owner, true, tp);
  const info = await connection.getAccountInfo(ata, "confirmed");
  if (!info) {
    return { address: ata, ixs: [spl.createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint, tp)], signers: [], note: "create-ata" };
  }
  const is2022 = tp.equals(spl.TOKEN_2022_PROGRAM_ID);
  let usable = false;
  try {
    const acct = spl.unpackAccount(ata, info, tp);
    const memo = is2022 ? spl.getMemoTransfer(acct) : null;
    const guard = is2022 ? spl.getCpiGuard(acct) : null;
    usable = acct.owner.equals(owner) && acct.mint.equals(mint) && !memo?.requireIncomingTransferMemos && !guard?.lockCpi;
  } catch {
    usable = false;
  }
  if (usable) return { address: ata, ixs: [], signers: [], note: "ata" };

  const fresh = web3.Keypair.generate();
  let space = 165;
  if (is2022) {
    const mintInfo = await spl.getMint(connection, mint, "confirmed", tp);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accountExts = spl.getExtensionTypes(mintInfo.tlvData).flatMap((e: any) =>
      e === spl.ExtensionType.TransferFeeConfig ? [spl.ExtensionType.TransferFeeAmount] : []);
    space = spl.getAccountLen(accountExts);
  }
  const lamports = await connection.getMinimumBalanceForRentExemption(space);
  return {
    address: fresh.publicKey,
    ixs: [
      web3.SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: fresh.publicKey, space, lamports, programId: tp }),
      spl.createInitializeAccount3Instruction(fresh.publicKey, mint, owner, tp),
    ],
    signers: [fresh],
    note: "fresh-account",
  };
}
