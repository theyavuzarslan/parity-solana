import type { Metadata } from "next";
import { MarketsBoard } from "@/features/markets/MarketsBoard";

export const metadata: Metadata = { title: "Markets" };

export default function MarketsPage() {
  return <MarketsBoard />;
}
