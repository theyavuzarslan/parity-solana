/** PDA helpers (mirror scripts/src/env.ts). Uint8Array seeds only, so they run in the browser. */
import { PublicKey } from "@solana/web3.js";
import { PRICE_SHARD, PYTH_PUSH_ORACLE } from "./config";

const enc = new TextEncoder();
const u16le = (n: number) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
const u64le = (n: bigint | number) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
/** 3-byte ASCII rate code, NUL-padded (seeds `["rate", code]`). */
export const code3 = (c: string) => { const b = new Uint8Array(3); b.set(enc.encode(c.slice(0, 3))); return b; };

export function pdas(programId: PublicKey) {
  const pda = (seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, programId)[0];
  return {
    config: () => pda([enc.encode("config")]),
    demo: () => pda([enc.encode("demo")]),
    rate: (code: string) => pda([enc.encode("rate"), code3(code)]),
    market: (id: number) => pda([enc.encode("market"), u16le(id)]),
    vault: (mint: PublicKey) => pda([enc.encode("vault"), mint.toBytes()]),
    insurance: (mint: PublicKey) => pda([enc.encode("insurance"), mint.toBytes()]),
    offer: (maker: PublicKey, nonce: bigint | number) => pda([enc.encode("offer"), maker.toBytes(), u64le(nonce)]),
    position: (offer: PublicKey, index: bigint | number) => pda([enc.encode("position"), offer.toBytes(), u64le(index)]),
  };
}
export type Pdas = ReturnType<typeof pdas>;

/** Pyth push-oracle price feed account: seeds [shard u16 LE, feed id]. */
export const priceFeedPda = (feedIdHex: string, shard = PRICE_SHARD) =>
  PublicKey.findProgramAddressSync([u16le(shard), hex(feedIdHex)], new PublicKey(PYTH_PUSH_ORACLE))[0];
