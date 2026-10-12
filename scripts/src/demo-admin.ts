// Admin demo controls. Usage: tsx src/demo-admin.ts clock <days> | mode <on|off>
import { BN, CLUSTER, configPda, demoPda, deployer, program } from "./env.js";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const admin = deployer();
  const p = program(admin);
  if (cmd === "clock") {
    const secs = Math.round(Number(arg) * 86_400);
    const sig = await p.methods.setDemoClock(new BN(secs)).accountsPartial({ config: configPda(), admin: admin.publicKey }).rpc();
    console.log(`[demo-admin] ${CLUSTER} demo clock offset = +${arg}d (${secs}s)  ${sig}`);
  } else if (cmd === "mode") {
    const sig = await p.methods.setDemoMode(arg === "on").accountsPartial({ config: configPda(), admin: admin.publicKey, demoState: demoPda() }).rpc();
    console.log(`[demo-admin] ${CLUSTER} demo mode ${arg}  ${sig}`);
  } else {
    throw new Error("usage: demo-admin.ts clock <days> | mode <on|off>");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
