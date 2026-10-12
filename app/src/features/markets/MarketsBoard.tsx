"use client";

import { GROUP_ORDER } from "@/data/markets";
import { useParityQuery } from "@/data/provider";
import type { MarketQuote } from "@/data/types";
import { fmtAge, fmtStamp } from "@/lib/format";
import { MarketLine, MarketRow } from "@/components/MarketRow";
import { Panel } from "@/components/Panel";

const HEADS = ["Spot", "Fwd 30D", "Fwd 90D", "Fwd 180D", "Carry", "Best offer"];

export function MarketsBoard() {
  const markets = useParityQuery((d) => d.getMarkets(), [], 15_000, (d) => d.peek?.markets());
  const health = useParityQuery((d) => d.getFeedHealth(), [], 15_000);
  const demo = useParityQuery((d) => d.getDemo());
  const list = markets.value ?? [];
  const open = list.filter((m) => m.status === "OPEN").length;
  const ref = list.filter((m) => m.status === "REF").length;
  const groups = GROUP_ORDER.map((g) => ({ g, rows: list.filter((m) => m.group === g) })).filter((x) => x.rows.length);

  const relayed = health.value?.relayedAt ? ` Prices last relayed ${fmtStamp(health.value.relayedAt)}.` : "";
  const feedLine = demo.value?.demoMode
    ? `${health.value?.note ?? "Demo mode is on: demo prices supersede the feed, every market shows OPEN."}${relayed}`
    : health.value?.live
      ? `Live from Pyth Hermes · checked ${health.value.checkedAt ? fmtAge(health.value.checkedAt) : "just now"}.`
      : (health.value?.note ?? "ECB reference rate (daily) — not a live feed.");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-display text-3xl text-navy md:text-[3rem]">Live status board</h1>
          <p className="mt-2 max-w-prose text-navy-2">
            Fifteen markets. Forwards are computed from spot and the rate gap: F = S × (1 + r<sub>quote</sub>·t) / (1 + r<sub>base</sub>·t). Rates are demo values, to be verified.
          </p>
        </div>
        <div className="text-right">
          <span className="t-label block text-xs text-navy-2">{ref && !open ? "On reference rates" : "Open now"}</span>
          <span className="t-num text-2xl text-carbon">{list.length ? `${ref && !open ? ref : open} / ${list.length}` : "—"}</span>
        </div>
      </div>
      <p className="mt-4 border-y border-hairline py-2 text-sm text-navy-2" role="status">{feedLine}</p>

      {!list.length ? (
        <div className="mt-8 h-48 border-y-2 border-navy" aria-hidden />
      ) : (
        <div className="mt-8 space-y-10">
          {groups.map(({ g, rows }) => (
            <Panel key={g} title={g} aside={<span>{rows.length} market{rows.length > 1 ? "s" : ""}</span>}>
              <Board rows={rows} />
            </Panel>
          ))}
        </div>
      )}
      <p className="mt-8 text-xs text-navy-2">
        REF: priced off the ECB reference rate (daily) — a daily reference, not a live feed; USD/CNH uses CNY as a proxy. CLOSED: the last Pyth price is older than 120 seconds (FX closes at weekends; it reopens Sunday 22:00 UTC). STALE: no feed for this market — gold and silver show round demo prices unless a Pyth key is set. Rates are demo values, to be verified. Best offer = tightest demo maker spread.
      </p>
    </div>
  );
}

function Board({ rows }: { rows: MarketQuote[] }) {
  return (
    <>
      <table className="hidden w-full table-fixed border-collapse border-y-2 border-navy bg-coupon md:table">
        <colgroup>
          <col className="w-[18%]" />
          {HEADS.map((h) => <col key={h} className="w-[11%]" />)}
          <col className="w-[16%]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="t-label px-2 py-2 text-left text-xs text-navy-2 lg:px-3">Market</th>
            {HEADS.map((h) => (
              <th key={h} scope="col" className="t-label px-2 py-2 text-right text-xs text-navy-2 lg:px-3">{h}</th>
            ))}
            <th scope="col" className="t-label px-2 py-2 text-left text-xs text-navy-2 lg:px-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => <MarketRow key={q.id} q={q} />)}
        </tbody>
      </table>
      <ul className="border-b-2 border-t-2 border-navy bg-coupon px-3 md:hidden">
        {rows.map((q) => <MarketLine key={q.id} q={q} />)}
      </ul>
    </>
  );
}
