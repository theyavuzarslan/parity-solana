import { marketConfig } from "@/data/markets";
import type { MarketQuote } from "@/data/types";
import { cx, fmtPct, fmtPrice, fmtStamp } from "@/lib/format";
import { relayLabel } from "@/lib/sourceLabel";
import { STATUS_NOTE, STATUS_SUB, StatusChip } from "./StatusChip";

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cx("px-2 py-3 text-right align-middle lg:px-3", className)}>{children}</td>;
}

/** Small caps tag under a spot: where the number came from. Synthetic values always say "demo". */
export function SourceTag({ q, className }: { q: MarketQuote; className?: string }) {
  const text =
    q.source === "demo-static" ? "demo"
    : q.source === "demo-override" ? "demo mode"
    : q.source === "relay" ? `relayed · ${relayLabel()}`
    : q.source === "ecb-ref" ? `ECB ${fmtStamp(q.publishTime).slice(0, 6)}${q.id === "USD/CNH" ? " · CNY proxy" : ""}`
    : q.status === "CLOSED" ? `last ${fmtStamp(q.publishTime)}`
    : "Pyth";
  return <span className={cx("t-label block text-xs text-navy-2", className)}>{text}</span>;
}

function StatusCell({ q }: { q: MarketQuote }) {
  const note = STATUS_NOTE[q.status];
  const sub = STATUS_SUB[q.status];
  return (
    <span className="flex flex-col items-start gap-1">
      <StatusChip status={q.status} />
      {note ? <span className="text-xs text-navy-2">{note}</span> : null}
      {sub ? <span className="text-xs text-navy-2">{sub}</span> : null}
    </span>
  );
}

/** One row of the live status board (desktop / tablet table). */
export function MarketRow({ q }: { q: MarketQuote }) {
  const dp = marketConfig(q.id).dp;
  const dim = q.status === "CLOSED" || q.status === "STALE";
  return (
    <tr className="border-t border-hairline text-sm lg:text-base">
      <th scope="row" className="px-2 py-3 text-left align-middle lg:px-3">
        <span className="t-label block text-base text-navy">{q.id}</span>
        <span className="block text-xs text-navy-2">{marketConfig(q.id).label}</span>
      </th>
      <Cell>
        <span className={cx("t-num text-carbon", dim && "opacity-60")}>{fmtPrice(q.spot, dp)}</span>
        <SourceTag q={q} />
      </Cell>
      <Cell><span className="t-num text-navy">{fmtPrice(q.forwards[30], dp)}</span></Cell>
      <Cell><span className="t-num text-navy">{fmtPrice(q.forwards[90], dp)}</span></Cell>
      <Cell><span className="t-num text-navy">{fmtPrice(q.forwards[180], dp)}</span></Cell>
      <Cell><span className="t-num text-navy">{fmtPct(q.carryPct, 2, true)}</span></Cell>
      <Cell><span className="t-num text-navy">{q.bestSpreadBps === null ? "—" : `${q.bestSpreadBps} bps`}</span></Cell>
      <td className="px-2 py-3 text-left align-middle lg:px-3">
        <StatusCell q={q} />
      </td>
    </tr>
  );
}

/** Phone layout: two ruled lines per market, no inner scroller. */
export function MarketLine({ q }: { q: MarketQuote }) {
  const dp = marketConfig(q.id).dp;
  const dim = q.status === "CLOSED" || q.status === "STALE";
  return (
    <li className="border-t border-hairline py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-label text-base text-navy">{q.id}</span>
        <span className="text-right">
          <span className={cx("t-num text-lg text-carbon", dim && "opacity-60")}>{fmtPrice(q.spot, dp)}</span>
          <SourceTag q={q} />
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
        {([30, 90, 180] as const).map((t) => (
          <div key={t} className="min-w-0">
            <dt className="t-label text-navy-2">FWD {t}D</dt>
            <dd className="t-num truncate text-navy">{fmtPrice(q.forwards[t], dp)}</dd>
          </div>
        ))}
        <div>
          <dt className="t-label text-navy-2">CARRY</dt>
          <dd className="t-num text-navy">{fmtPct(q.carryPct, 2, true)}</dd>
        </div>
        <div>
          <dt className="t-label text-navy-2">BEST OFFER</dt>
          <dd className="t-num text-navy">{q.bestSpreadBps === null ? "—" : `${q.bestSpreadBps} bps`}</dd>
        </div>
        <div className="min-w-0">
          <dt className="sr-only">Status</dt>
          <dd><StatusCell q={q} /></dd>
        </div>
      </dl>
    </li>
  );
}
