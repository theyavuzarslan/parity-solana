// POST { owner } -> mints 1,000 test USDC + 1,000 test USDG to the owner's ATAs; once per wallet
// per 10 minutes. Test SOL is not handed out here: use https://faucet.solana.com.
import { createFaucet, envMintTo } from "@/server/faucet";

export const dynamic = "force-dynamic";

const faucet = createFaucet({ mintTo: envMintTo() });

export async function POST(req: Request) {
  const input = await req.json().catch(() => null);
  const { status, body } = await faucet.handle(input);
  return Response.json({ ...body, sol: "https://faucet.solana.com" }, { status, headers: { "cache-control": "no-store" } });
}
