/** Anchor program client for the browser (read-only provider; signing goes through the wallet bridge). */
import { AnchorProvider, BorshCoder, EventParser, Program, type Wallet } from "@anchor-lang/core";
import { Connection, PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import idlJson from "shared/idl/parity.json";
import type { Parity } from "shared/idl/parity";

export type ParityProgram = Program<Parity>;

/** Read-only wallet: Anchor's provider needs one, but this app never signs through Anchor. */
const READ_ONLY: Wallet = {
  publicKey: PublicKey.default,
  payer: undefined as never,
  signTransaction: async <T extends Transaction | VersionedTransaction>(): Promise<T> => { throw new Error("read-only provider"); },
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(): Promise<T[]> => { throw new Error("read-only provider"); },
};

/** The IDL with its address replaced by the configured program id (never trust idl.address blindly). */
export function idlFor(programId: PublicKey): Parity {
  return { ...(idlJson as unknown as Parity), address: programId.toBase58() } as Parity;
}

export function makeProgram(connection: Connection, programId: PublicKey): ParityProgram {
  const provider = new AnchorProvider(connection, READ_ONLY, { commitment: "confirmed" });
  return new Program<Parity>(idlFor(programId), provider);
}

export function eventParser(program: ParityProgram): EventParser {
  return new EventParser(program.programId, new BorshCoder(program.idl as never));
}

/** Anchor program error name from a send/simulate failure (logs carry "Error Code: X."). */
export function programErrorName(e: unknown): string | undefined {
  const err = e as { logs?: string[]; transactionLogs?: string[]; message?: string; getLogs?: () => string[] } | null;
  const logs = err?.logs ?? err?.transactionLogs ?? [];
  const text = [String(err?.message ?? ""), ...logs].join("\n");
  return text.match(/Error Code: (\w+)\./)?.[1];
}
