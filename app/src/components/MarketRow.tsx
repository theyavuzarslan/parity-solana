import { marketConfig } from "@/data/markets";
import type { MarketQuote } from "@/data/types";
import { cx, fmtPct, fmtPrice } from "@/lib/format";
import { STATUS_NOTE, StatusChip } from "./StatusChip";

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cx("px-2 py-3 text-right align-middle lg:px-3", className)}>{children}</td>;
}

/** One row of the live status board (desktop / tablet table). */
export function MarketRow({ q }: { q: MarketQuote }) {
  const dp = marketConfig(q.id).dp;
  const note = STATUS_NOTE[q.status];
  const dim = q.status !== "OPEN";
  return (
    <tr className="border-t border-hairline text-sm lg:text-base">
      <th scope="row" className="px-2 py-3 text-left align-middle lg:px-3">
        <span className="t-label block text-base text-navy">{q.id}</span>
        <span className="block text-xs text-navy-2">{marketConfig(q.id).label}</span>
      </th>
      <Cell><span className={cx("t-num text-carbon", dim && "opacity-70")}>{fmtPrice(q.spot, dp)}</span></Cell>
      <Cell><span className="t-num text-navy">{fmtPrice(q.forwards[30], dp)}</span></Cell>
      <Cell><span className="t-num text-navy">{fmtPrice(q.forwards[90], dp)}</span></Cell>
      <Cell><span className="t-num text-navy">{fmtPrice(q.forwards[180], dp)}</span></Cell>
      <Cell><span className="t-num text-navy">{fmtPct(q.carryPct, 2, true)}</span></Cell>
      <Cell><span className="t-num text-navy">{q.bestSpreadBps === null ? "—" : `${q.bestSpreadBps} bps`}</span></Cell>
      <td className="px-2 py-3 text-left align-middle lg:px-3">
        <span className="flex flex-col items-start gap-1">
          <StatusChip status={q.status} />
          {note ? <span className="text-xs text-navy-2">{note}</span> : null}
        </span>
      </td>
    </tr>
  );
}

/** Phone layout: two ruled lines per market, no inner scroller. */
export function MarketLine({ q }: { q: MarketQuote }) {
  const dp = marketConfig(q.id).dp;
  const note = STATUS_NOTE[q.status];
  return (
    <li className="border-t border-hairline py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-label text-base text-navy">{q.id}</span>
        <span className="t-num text-lg text-carbon">{fmtPrice(q.spot, dp)}</span>
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
        <div className="flex flex-col items-start gap-0.5">
          <dt className="sr-only">Status</dt>
          <dd><StatusChip status={q.status} /></dd>
          {note ? <dd className="text-navy-2">{note}</dd> : null}
        </div>
      </dl>
    </li>
  );
}
