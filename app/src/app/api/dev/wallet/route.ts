// LOCAL DEV ONLY — signs with keys/taker.json. Refused unless PARITY_DEV_WALLET=1, not on Vercel, not production, localhost (server/devWallet.ts).
import { devWalletHandlers } from "@/server/devWallet";

export const dynamic = "force-dynamic";
export const { GET, POST } = devWalletHandlers("taker");
