// Shared environment: cluster, keypairs, program client, PDAs and small tx helpers.
// CLUSTER=localnet|devnet (default devnet). RPC_URL overrides the endpoint.
import { AnchorProvider, Program, Wallet, AnchorError, BN } from "@anchor-lang/core";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export { BN };

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const KEYS = join(ROOT, "keys");

export type Cluster = "localnet" | "devnet";
export const CLUSTER: Cluster = (process.env.CLUSTER as Cluster) ?? "devnet";
if (CLUSTER !== "localnet" && CLUSTER !== "devnet") throw new Error(`CLUSTER must be localnet|devnet, got ${CLUSTER}`);
// Optional private devnet RPC (e.g. Helius): one line `RPC_URL=...` in the gitignored repo-root .env.rpc.
function rpcFromFile(): string | undefined {
  const f = join(ROOT, ".env.rpc");
  if (!existsSync(f)) return undefined;
  const m = readFileSync(f, "utf8").match(/^\s*RPC_URL\s*=\s*(\S+)/m);
  return m?.[1];
}
export const RPC_URL =
  process.env.RPC_URL ?? (CLUSTER === "devnet" ? rpcFromFile() : undefined) ?? (CLUSTER === "localnet" ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com");

export const connection = new Connection(RPC_URL, "confirmed");

export const PROGRAM_ID = new PublicKey("55jabap7VG6LKKJtidxVRBuLaLzFz6P96uPUicR2e4EQ");
export const PYTH_PUSH_ORACLE = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");
export const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
export const PRICE_SHARD = 1000;

// ---------- keypairs ----------
export function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}
/** Load keys/<name>.json, creating it (mode 0600) if missing. Never prints the secret. */
export function keypair(name: string): Keypair {
  const path = join(KEYS, `${name}.json`);
  if (existsSync(path)) return loadKeypair(path);
  mkdirSync(KEYS, { recursive: true });
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  console.log(`created keys/${name}.json -> ${kp.publicKey.toBase58()}`);
  return kp;
}
/** Deployer = upgrade authority = protocol admin. */
export const deployer = (): Keypair =>
  loadKeypair(process.env.DEPLOYER_KEYPAIR ?? join(homedir(), ".config/solana/id.json"));

// ---------- program ----------
const IDL_PATH = join(ROOT, "target/idl/parity.json");
export function idl(): any {
  return JSON.parse(readFileSync(IDL_PATH, "utf8"));
}
// Untyped on purpose: the IDL is read at runtime from target/idl (anchor build output).
export function program(signer: Keypair = deployer()): any {
  const provider = new AnchorProvider(connection, new Wallet(signer), { commitment: "confirmed" });
  return new Program(idl(), provider) as Program<any>;
}

// ---------- PDAs ----------
const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u64le = (n: bigint | number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
export const code3 = (c: string) => Buffer.from(c.padEnd(3, "\0").slice(0, 3), "ascii");

export const configPda = () => pda([Buffer.from("config")]);
export const demoPda = () => pda([Buffer.from("demo")]);
export const ratePda = (code: string) => pda([Buffer.from("rate"), code3(code)]);
export const marketPda = (id: number) => pda([Buffer.from("market"), u16le(id)]);
export const vaultPda = (mint: PublicKey) => pda([Buffer.from("vault"), mint.toBuffer()]);
export const insurancePda = (mint: PublicKey) => pda([Buffer.from("insurance"), mint.toBuffer()]);
export const offerPda = (maker: PublicKey, nonce: bigint | number) =>
  pda([Buffer.from("offer"), maker.toBuffer(), u64le(nonce)]);
export const positionPda = (offer: PublicKey, index: bigint | number) =>
  pda([Buffer.from("position"), offer.toBuffer(), u64le(index)]);
export const programDataPda = () =>
  PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], BPF_UPGRADEABLE_LOADER)[0];
/** Pyth push-oracle price feed account: seeds [shard u16 LE, feed id]. */
export const priceFeedPda = (feedIdHex: string, shard = PRICE_SHARD) =>
  PublicKey.findProgramAddressSync([u16le(shard), Buffer.from(feedIdHex, "hex")], PYTH_PUSH_ORACLE)[0];

// ---------- mints file ----------
export type Mints = { usdc: PublicKey; usdg: PublicKey };
const MINTS_PATH = () => join(KEYS, `mints.${CLUSTER}.json`);
export function readMints(): Mints {
  const j = JSON.parse(readFileSync(MINTS_PATH(), "utf8"));
  return { usdc: new PublicKey(j.usdc), usdg: new PublicKey(j.usdg) };
}
export function writeMints(m: Mints) {
  writeFileSync(MINTS_PATH(), JSON.stringify({ usdc: m.usdc.toBase58(), usdg: m.usdg.toBase58() }, null, 2));
}
export const hasMints = () => existsSync(MINTS_PATH());
export const tokenProgramFor = (mint: PublicKey, mints: Mints) =>
  mint.equals(mints.usdg) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

// ---------- helpers ----------
export const USD = (n: number) => BigInt(Math.round(n * 1_000_000));
export const exists = async (addr: PublicKey) => (await connection.getAccountInfo(addr)) !== null;

export async function sendIxs(ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
  const tx = new Transaction().add(...ixs);
  return sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed" });
}

/** Top up `to` to at least `minSol` from the deployer (idempotent). */
export async function ensureSol(to: PublicKey, minSol: number) {
  const bal = await connection.getBalance(to);
  const need = Math.ceil(minSol * LAMPORTS_PER_SOL) - bal;
  if (need <= 0) return;
  const d = deployer();
  const sig = await sendIxs([SystemProgram.transfer({ fromPubkey: d.publicKey, toPubkey: to, lamports: need })], [d]);
  console.log(`funded ${to.toBase58()} +${(need / LAMPORTS_PER_SOL).toFixed(3)} SOL  ${sig}`);
}

/** Anchor error name if `e` is a program error, else undefined. */
export function errorName(e: unknown): string | undefined {
  if (e instanceof AnchorError) return e.error.errorCode.code;
  const logs: string[] | undefined = (e as any)?.logs ?? (e as any)?.transactionLogs;
  const text = [String((e as any)?.message ?? ""), ...(logs ?? [])].join("\n");
  const m = text.match(/Error Code: (\w+)\./);
  return m?.[1];
}

/** "set" if newly done, "skip" if already there. */
export function logStep(what: string, state: "skip" | "done", extra = "") {
  console.log(`${state === "skip" ? "  skip" : "  done"}  ${what}${extra ? "  " + extra : ""}`);
}
