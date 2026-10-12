// POST { owner } -> mints 10,000 test USDC + 10,000 test USDG to the owner's ATAs. The wallet must
// already hold ≥ 0.01 devnet SOL (from https://faucet.solana.com); limits: once per wallet and 5 per
// IP per 10 minutes, 60 per hour per instance. See server/faucet.ts.
import { clientIp, createFaucet, envGetLamports, envMintTo } from "@/server/faucet";

export const dynamic = "force-dynamic";

const faucet = createFaucet({ mintTo: envMintTo(), getLamports: envGetLamports() });

export async function POST(req: Request) {
  const input = await req.json().catch(() => null);
  const { status, body } = await faucet.handle(input, clientIp(req.headers));
  return Response.json({ ...body, sol: "https://faucet.solana.com" }, { status, headers: { "cache-control": "no-store" } });
}
