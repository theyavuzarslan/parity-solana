// Mock collateral mints. USDC: SPL Token, 6dp. USDG: Token-2022, 6dp, MetadataPointer + TokenMetadata
// ("Test USDG" / "tUSDG"), no other extensions (init_collateral rejects them).
// Mint authority (and metadata update authority) = keys/faucet.json. Idempotent.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ExtensionType, LENGTH_SIZE, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, TYPE_SIZE,
  createInitializeMetadataPointerInstruction, createInitializeMint2Instruction, getMintLen,
  MINT_SIZE,
} from "@solana/spl-token";
import { createInitializeInstruction, pack, type TokenMetadata } from "@solana/spl-token-metadata";
import { CLUSTER, KEYS, connection, deployer, ensureSol, keypair, sendIxs, exists } from "./env.js";

const DECIMALS = 6;
const FAUCET_SOL = CLUSTER === "devnet" ? 0.5 : 2;

async function main() {
  const payer = deployer();
  const faucet = keypair("faucet");
  console.log(`[01-mints] cluster=${CLUSTER} faucet(mint authority)=${faucet.publicKey.toBase58()}`);

  // Resume-safe: the mints file is written after each mint is created, so a run that died between
  // USDC and USDG reuses the existing USDC. The faucet is topped up on every path.
  const path = join(KEYS, `mints.${CLUSTER}.json`);
  const saved: { usdc?: string; usdg?: string } = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const save = () => writeFileSync(path, JSON.stringify(saved, null, 2));
  const live = async (a?: string) => (a ? exists(new PublicKey(a)) : false);

  if ((await live(saved.usdc)) && (await live(saved.usdg))) {
    console.log(`  skip  mints exist  USDC=${saved.usdc}  USDG=${saved.usdg}`);
    await ensureSol(faucet.publicKey, FAUCET_SOL);
    return;
  }

  if (await live(saved.usdc)) {
    console.log(`  skip  USDC exists ${saved.usdc}`);
  } else {
    // USDC (SPL Token)
    const usdc = Keypair.generate();
    const rentUsdc = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    await sendIxs([
      SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: usdc.publicKey, space: MINT_SIZE, lamports: rentUsdc, programId: TOKEN_PROGRAM_ID }),
      createInitializeMint2Instruction(usdc.publicKey, DECIMALS, faucet.publicKey, null, TOKEN_PROGRAM_ID),
    ], [payer, usdc]);
    saved.usdc = usdc.publicKey.toBase58();
    delete saved.usdg; // a new USDC pairs with a new USDG; never mix runs
    save();
    console.log(`  done  USDC (SPL Token) ${saved.usdc}`);
  }

  // USDG (Token-2022 + metadata pointer to itself + token metadata)
  const usdg = Keypair.generate();
  const metadata: TokenMetadata = {
    mint: usdg.publicKey,
    name: "Test USDG",
    symbol: "tUSDG",
    uri: "",
    additionalMetadata: [],
    updateAuthority: faucet.publicKey,
  };
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const metaLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const rentUsdg = await connection.getMinimumBalanceForRentExemption(mintLen + metaLen);
  await sendIxs([
    SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: usdg.publicKey, space: mintLen, lamports: rentUsdg, programId: TOKEN_2022_PROGRAM_ID }),
    createInitializeMetadataPointerInstruction(usdg.publicKey, faucet.publicKey, usdg.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMint2Instruction(usdg.publicKey, DECIMALS, faucet.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: usdg.publicKey,
      updateAuthority: faucet.publicKey,
      mint: usdg.publicKey,
      mintAuthority: faucet.publicKey,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
  ], [payer, usdg, faucet]);
  console.log(`  done  USDG (Token-2022 + metadata) ${usdg.publicKey.toBase58()}`);

  saved.usdg = usdg.publicKey.toBase58();
  save();
  // The app's faucet route signs mint_to + ATA creation with this key.
  await ensureSol(faucet.publicKey, FAUCET_SOL);
}

main().catch((e) => { console.error(e); process.exit(1); });
