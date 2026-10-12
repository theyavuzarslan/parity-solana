// Read-only: print every Position (status, breach, margins) and the config's demo state.
import { CLUSTER, configPda, program } from "./env.js";
import { marketById } from "./markets.js";

async function main() {
  const p = program();
  const cfg: any = await p.account.config.fetch(configPda());
  console.log(`[inspect] ${CLUSTER} demo_mode=${cfg.demoMode} clock_offset=${cfg.demoClockOffset.toString()}s admin=${cfg.admin.toBase58()}`);
  const all: any[] = await p.account.position.all();
  all.sort((a, b) => a.account.openedAt.toNumber() - b.account.openedAt.toNumber());
  for (const { publicKey, account: a } of all) {
    console.log(`  ${publicKey.toBase58()} ${marketById(a.marketId).symbol} long=${a.long.toBase58().slice(0, 6)} short=${a.short.toBase58().slice(0, 6)} ` +
      `notional=$${a.notionalUsd.toNumber() / 1e6} strike=${(a.strike.toNumber() / 1e8).toFixed(4)} status=${Object.keys(a.status)[0]} breach=${a.breachCount} ` +
      `margin L/S=${a.marginLong.toNumber() / 1e6}/${a.marginShort.toNumber() / 1e6} maturity=${new Date(a.maturity.toNumber() * 1000).toISOString().slice(0, 10)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
