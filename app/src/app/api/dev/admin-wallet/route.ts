// LOCAL DEV ONLY — signs with the deployer keypair (config.admin on a local deploy). Same request-time guard as /api/dev/wallet.
import { devWalletHandlers } from "@/server/devWallet";

export const dynamic = "force-dynamic";
export const { GET, POST } = devWalletHandlers("admin");
