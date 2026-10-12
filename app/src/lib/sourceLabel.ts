import { CHAIN } from "@/chain/config";
import type { SpotSource } from "@/data/types";

/** Where the relay's devnet prices come from (NEXT_PUBLIC_RELAY_SOURCE; the relay itself is off-chain). */
export const relayLabel = (src: "ecb" | "hermes" = CHAIN.relaySource) => (src === "hermes" ? "Pyth via Hermes" : "ECB daily");

/** One honest sentence-fragment for where a spot came from (receipt, landing). */
export function sourceLabel(source: SpotSource | undefined): string {
  switch (source) {
    case "pyth": return "Pyth (live)";
    case "relay": return `Admin-relayed reference price (${relayLabel()})`;
    case "demo-override": return "demo override — demo mode is on (preview, set from Dispatch)";
    case "ecb-ref": return "ECB reference rate (daily) — not a live feed";
    default: return "demo";
  }
}
