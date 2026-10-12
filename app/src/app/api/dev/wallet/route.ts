// LOCALNET ONLY — signs with keys/taker.json. Refuses on any other cluster or host.
import { devWalletHandlers } from "@/server/devWallet";

export const dynamic = "force-dynamic";
export const { GET, POST } = devWalletHandlers("taker");
