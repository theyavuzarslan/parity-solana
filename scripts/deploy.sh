#!/usr/bin/env bash
# Full idempotent deploy + seed. Usage: CLUSTER=devnet|localnet scripts/deploy.sh
#   anchor build -> solana program deploy (program id keys/parity-program-keypair.json, upgrade
#   authority = deployer) -> mints -> initialize (signed by the upgrade authority) -> init_collateral x2
#   -> set_rate x13 -> upsert_market x15 -> offers -> fund_insurance -> anchor idl init -> addresses.
# Env: SKIP_BUILD=1, UPGRADE=1 (redeploy an existing program), LIQ_GAP_SECS (default 30),
#      DEPLOYER_KEYPAIR (default ~/.config/solana/id.json).
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLUSTER="${CLUSTER:-devnet}"
case "$CLUSTER" in
  devnet) URL="${RPC_URL:-https://api.devnet.solana.com}" ;;
  localnet) URL="${RPC_URL:-http://127.0.0.1:8899}" ;;
  *) echo "CLUSTER must be devnet|localnet" >&2; exit 1 ;;
esac
# Never print RPC credentials: show scheme://host only (drops paths like /<token>/ and ?api-key=...).
# Note: the full URL is still passed to solana/anchor as an argument, so it is visible in `ps` on this machine.
URL_SAFE="$(printf '%s' "$URL" | sed -E 's#^([a-zA-Z]+://[^/?]+).*#\1#')"
WALLET="${DEPLOYER_KEYPAIR:-$HOME/.config/solana/id.json}"
PROGRAM_KP="$ROOT/keys/parity-program-keypair.json"
PROGRAM_ID="$(solana-keygen pubkey "$PROGRAM_KP")"
echo "== cluster=$CLUSTER url=$URL_SAFE program=$PROGRAM_ID deployer=$(solana-keygen pubkey "$WALLET")"
echo "== deployer balance: $(solana balance -u "$URL" -k "$WALLET")"

if [ -z "${SKIP_BUILD:-}" ]; then anchor build; fi
grep -q "declare_id!(\"$PROGRAM_ID\")" programs/parity/src/lib.rs || { echo "declare_id mismatch" >&2; exit 1; }
grep -q "\"address\": \"$PROGRAM_ID\"" target/idl/parity.json || { echo "IDL address mismatch" >&2; exit 1; }

if solana program show "$PROGRAM_ID" -u "$URL" >/dev/null 2>&1 && [ -z "${UPGRADE:-}" ]; then
  echo "  skip  program already deployed (UPGRADE=1 to redeploy)"
else
  if solana program show "$PROGRAM_ID" -u "$URL" >/dev/null 2>&1; then
    # Upgrade: grow programdata first if the new .so is larger (default max-len = original size).
    CUR=$(solana program show "$PROGRAM_ID" -u "$URL" | awk '/Data Length/ {print $3}')
    NEW=$(wc -c < target/deploy/parity.so | tr -d ' ')
    if [ "$NEW" -gt "$CUR" ]; then
      solana program extend "$PROGRAM_ID" $((NEW - CUR)) -u "$URL" --keypair "$WALLET"
    fi
  fi
  solana program deploy target/deploy/parity.so --program-id "$PROGRAM_KP" \
    -u "$URL" --keypair "$WALLET" --upgrade-authority "$WALLET"
fi

cd scripts
for s in 01-mints 02-init 03-rates-markets 04-offers 05-insurance; do
  pnpm exec tsx "src/$s.ts"
done
cd "$ROOT"

if anchor idl fetch "$PROGRAM_ID" --provider.cluster "$URL" >/dev/null 2>&1; then
  echo "  skip  IDL already on chain (use: anchor idl upgrade -f target/idl/parity.json $PROGRAM_ID)"
else
  anchor idl init -f target/idl/parity.json "$PROGRAM_ID" --provider.cluster "$URL" --provider.wallet "$WALLET" \
    || echo "  warn  anchor idl init failed (on localnet the program-metadata program is not loaded; harmless)"
fi

cd scripts && pnpm exec tsx src/06-devnet-doc.ts
echo "== done. deployer balance: $(solana balance -u "$URL" -k "$WALLET")"
