# Devnet deployment

Not deployed yet: the deployer wallet needs devnet SOL first (about 9 SOL: program rent plus 3 SOL
for the faucet key; see the ops report).
Once funded, run from the repo root:

```bash
CLUSTER=devnet scripts/deploy.sh          # build, deploy, seed, IDL; rewrites this file with addresses
CLUSTER=devnet pnpm --filter scripts relay   # admin-relayed reference prices (keep running)
CLUSTER=devnet pnpm --filter scripts keeper  # mark / liquidate / settle cranks (keep running)
```

**Prices on devnet are admin-relayed reference prices** (demo mode on): Pyth Hermes when
`PYTH_API_KEY` is set, otherwise ECB reference rates (Frankfurter) and a static, labelled reference
for gold and silver. Production reads Pyth price accounts on-chain.

Tenors: the program allows 1–365 days; the seeded offers quote 7–180 days.

The faucet mint authority (`keys/faucet.json`) pays ATA rent on every app faucet request. `01-mints.ts`
seeds it with 3 SOL (`FAUCET_SOL` overrides); top it up when the faucet starts failing.
