import type { Metadata } from "next";
import { WalletView } from "@/features/wallet/WalletView";

export const metadata: Metadata = { title: "Wallet" };

export default function WalletPage() {
  return <WalletView />;
}
