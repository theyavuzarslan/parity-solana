// Mock collateral mints. USDC: SPL Token, 6dp. USDG: Token-2022, 6dp, MetadataPointer + TokenMetadata
// ("Test USDG" / "tUSDG"), no other extensions (init_collateral rejects them).
// Mint authority (and metadata update authority) = keys/faucet.json. Idempotent.
import {
  Keypair, SystemProgram,
} from "@solana/web3.js";
import {
  ExtensionType, LENGTH_SIZE, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, TYPE_SIZE,
  createInitializeMetadataPointerInstruction, createInitializeMint2Instruction, getMintLen,
  MINT_SIZE,
} from "@solana/spl-token";
import { createInitializeInstruction, pack, type TokenMetadata } from "@solana/spl-token-metadata";
import { CLUSTER, connection, deployer, ensureSol, hasMints, keypair, readMints, sendIxs, writeMints, exists } from "./env.js";

const DECIMALS = 6;

async function main() {
  const payer = deployer();
  const faucet = keypair("faucet");
  console.log(`[01-mints] cluster=${CLUSTER} faucet(mint authority)=${faucet.publicKey.toBase58()}`);

  if (hasMints()) {
    const m = readMints();
    if ((await exists(m.usdc)) && (await exists(m.usdg))) {
      console.log(`  skip  mints exist  USDC=${m.usdc.toBase58()}  USDG=${m.usdg.toBase58()}`);
      return;
    }
  }

  // USDC (SPL Token)
  const usdc = Keypair.generate();
  const rentUsdc = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  await sendIxs([
    SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: usdc.publicKey, space: MINT_SIZE, lamports: rentUsdc, programId: TOKEN_PROGRAM_ID }),
    createInitializeMint2Instruction(usdc.publicKey, DECIMALS, faucet.publicKey, null, TOKEN_PROGRAM_ID),
  ], [payer, usdc]);
  console.log(`  done  USDC (SPL Token) ${usdc.publicKey.toBase58()}`);

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

  writeMints({ usdc: usdc.publicKey, usdg: usdg.publicKey });
  // The app's faucet route signs mint_to + ATA creation with this key.
  await ensureSol(faucet.publicKey, CLUSTER === "devnet" ? 0.5 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
