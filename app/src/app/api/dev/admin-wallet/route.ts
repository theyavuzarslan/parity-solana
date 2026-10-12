// LOCALNET ONLY — signs with the deployer keypair (config.admin on a local deploy). Refuses elsewhere.
import { devWalletHandlers } from "@/server/devWallet";

export const dynamic = "force-dynamic";
export const { GET, POST } = devWalletHandlers("admin");
