#!/usr/bin/env bash
# `pusher` price mode: keep shard-1000 Pyth price-feed accounts fresh on devnet for the 12 feeds.
# Requires PYTH_API_KEY (Hermes answers 401 without it). Without a key use the relay instead:
#   CLUSTER=devnet pnpm --filter scripts relay
# Flags checked against the 11.3.0 source (dist/options.cjs, dist/solana/command.cjs). The key is
# the --hermes-access-token option (sent as "Authorization: Bearer <key>"). It is NOT put on the
# command line (visible in `ps`): it goes into a 0600 temp JSON file read via yargs' --config,
# deleted when the pusher exits. The RPC URL (if it embeds a key) is still an argument.
# Node: 11.3.0 crashes on Node 26 at import (@injectivelabs/networks); use Node 20, 22 or 24.
# Its bin file has no shebang, so it is run as `node dist/index.cjs`.
# When using this mode, turn demo mode off (set_demo_mode(false)) so the program reads Pyth.
set -euo pipefail
: "${PYTH_API_KEY:?set PYTH_API_KEY (Pyth Hermes API key)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
case "$NODE_MAJOR" in 20|22|24) ;; *) echo "price-pusher 11.3.0 needs Node 20/22/24 (found $NODE_MAJOR)" >&2; exit 1 ;; esac
KEYPAIR="${PUSHER_KEYPAIR:-$ROOT/keys/pusher.json}"
[ -f "$KEYPAIR" ] || { echo "missing $KEYPAIR (solana-keygen new -o keys/pusher.json, then fund it)" >&2; exit 1; }
if [ ! -f "$HERE/node_modules/@pythnetwork/price-pusher/dist/index.cjs" ]; then
  npm install --prefix "$HERE" --no-save @pythnetwork/price-pusher@11.3.0
fi
CFG="$(umask 077 && mktemp "${TMPDIR:-/tmp}/pusher-XXXXXX")"
trap 'rm -f "$CFG"' EXIT INT TERM
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ "hermes-access-token": process.env.PYTH_API_KEY }))' "$CFG"
node "$HERE/node_modules/@pythnetwork/price-pusher/dist/index.cjs" solana \
  --config "$CFG" \
  --endpoint "${RPC_URL:-https://api.devnet.solana.com}" \
  --keypair-file "$KEYPAIR" \
  --shard-id 1000 \
  --price-config-file "$HERE/price-config.yaml" \
  --price-service-endpoint https://hermes.pyth.network \
  --pyth-contract-address pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT \
  --pushing-frequency 15
