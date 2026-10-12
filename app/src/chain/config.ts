/**
 * Chain settings, from NEXT_PUBLIC_* env (inlined at build time, so each is read literally).
 *   NEXT_PUBLIC_CLUSTER     devnet | localnet (default devnet)
 *   NEXT_PUBLIC_RPC_URL     RPC endpoint (default per cluster)
 *   NEXT_PUBLIC_PROGRAM_ID  Parity program id; unset -> the app runs on preview (mock) data
 *   NEXT_PUBLIC_USDC_MINT / NEXT_PUBLIC_USDG_MINT  test collateral mints (the faucet needs them;
 *                           the client prefers the mints stored in the on-chain config)
 */
export type Cluster = "devnet" | "localnet";

const cluster: Cluster = process.env.NEXT_PUBLIC_CLUSTER === "localnet" ? "localnet" : "devnet";

export const CHAIN = {
  cluster,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || (cluster === "localnet" ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com"),
  programId: process.env.NEXT_PUBLIC_PROGRAM_ID || null,
  usdcMint: process.env.NEXT_PUBLIC_USDC_MINT || null,
  usdgMint: process.env.NEXT_PUBLIC_USDG_MINT || null,
} as const;

export const isLocalnet = () => CHAIN.cluster === "localnet";

export const SOL_FAUCET_URL = "https://faucet.solana.com";

/** Pyth push-oracle program and our price-feed shard (plan: Global Constraints). */
export const PYTH_PUSH_ORACLE = "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT";
export const PRICE_SHARD = 1000;
