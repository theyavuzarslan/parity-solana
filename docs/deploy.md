# Deploying the app to Vercel

The Vercel project is `parity-solana`, linked from the repo root (`.vercel/` is gitignored).

Project settings (already set; shown here so they can be recreated):

| Setting | Value |
|---|---|
| Framework | Next.js |
| Root Directory | `app` |
| Include source files outside the Root Directory | on (the app imports `../shared` and `../advisor`) |
| Install Command | `cd .. && pnpm install --frozen-lockfile` (one pnpm workspace at the repo root) |
| Build Command | `pnpm build` |
| Node.js | 22.x |

Deploy from the **repo root**, so the root `.vercelignore` applies (`keys/`, `.env*`, `target/`, local notes):

```sh
vercel deploy --prod --yes
```

## Preview mode (current)

Production has a single env var, `NEXT_PUBLIC_CLUSTER=devnet`. Without `NEXT_PUBLIC_PROGRAM_ID`
the app runs on preview (mock) data and shows the PREVIEW DATA chip. `/api/faucet` returns a
"not configured" error, and `/api/dev/*` always returns 403 on Vercel.

## Switching to the devnet program

1. Fund the deployer (about 9 SOL), then deploy and seed:

   ```sh
   CLUSTER=devnet scripts/deploy.sh
   ```

2. Add the production env vars. Names are listed in `app/.env.example`:

   | Variable | Where the value comes from |
   |---|---|
   | `NEXT_PUBLIC_PROGRAM_ID` | `solana-keygen pubkey keys/parity-program-keypair.json` (also printed by `deploy.sh`) |
   | `NEXT_PUBLIC_USDC_MINT` | `usdc` in `keys/mints.devnet.json` |
   | `NEXT_PUBLIC_USDG_MINT` | `usdg` in `keys/mints.devnet.json` |
   | `NEXT_PUBLIC_RPC_URL` | optional: a key-less or domain-restricted devnet RPC (it ships to every browser) |
   | `NEXT_PUBLIC_RELAY_SOURCE` | optional: `hermes` if the relay runs with `PYTH_API_KEY`, else leave unset (ecb) |
   | `FAUCET_SECRET_KEY` | **secret, server-only**: the JSON array in `keys/faucet.json` |
   | `PYTH_API_KEY` | optional, server-only |

   ```sh
   vercel env add NEXT_PUBLIC_PROGRAM_ID production   # paste the value when prompted
   vercel env add NEXT_PUBLIC_USDC_MINT production
   vercel env add NEXT_PUBLIC_USDG_MINT production
   vercel env add FAUCET_SECRET_KEY production --sensitive < keys/faucet.json
   ```

   Pipe secrets from the file rather than pasting them into the shell history. Never set
   `PARITY_DEV_WALLET` on Vercel.

3. Redeploy. `NEXT_PUBLIC_*` values are inlined at build time, so a change needs a new build:

   ```sh
   vercel deploy --prod --yes
   ```

4. Start the off-chain services, each in its own terminal (on a machine that holds `keys/`):

   ```sh
   CLUSTER=devnet pnpm --filter scripts relay    # admin-relayed reference prices (keep running)
   CLUSTER=devnet pnpm --filter scripts keeper   # mark / liquidate / settle cranks (keep running)
   ```

   Add `PYTH_API_KEY=...` to the relay's environment for Pyth Hermes prices.

5. Keep the faucet key (`solana-keygen pubkey keys/faucet.json`) topped up with devnet SOL: it pays
   ATA rent on every faucet request.

## Checks after a deploy

```sh
URL=https://parity-solana.vercel.app
for p in / /advisor /markets /wallet /dispatch; do curl -s -o /dev/null -w "$p %{http_code}\n" "$URL$p"; done
curl -s -o /dev/null -w "dev wallet %{http_code}\n" "$URL/api/dev/wallet"   # expect 403
curl -s -X POST -H 'content-type: application/json' -d '{}' "$URL/api/faucet"   # clean JSON error
```
