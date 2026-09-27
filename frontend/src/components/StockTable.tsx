import type { StockView } from '../types/api';
import { humanResource } from '../lib/format';
import { Empty } from './ui';

// "Send" is the only number that answers "may I move this?", so the numeric
// columns are fixed-width and only the resource name is allowed to wrap.
// It used to sit behind a horizontal scroll, which is as good as invisible.
export function StockTable({
  stocks,
  showDistrict = false,
  onPick,
  maxHeight,
}: {
  stocks: StockView[];
  showDistrict?: boolean;
  onPick?: (stock: StockView) => void;
  maxHeight?: number;
}) {
  if (stocks.length === 0) return <Empty>No stock recorded.</Empty>;

  const num = 'w-[52px] px-1.5 py-2 text-right font-mono text-xs';
  const head = 'px-1.5 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400';

  return (
    <div
      className="overflow-auto"
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full table-fixed border-collapse">
        <thead className="sticky top-0 z-10 bg-ink-800">
          <tr className="border-b border-white/10">
            {showDistrict && <th className="w-10 px-1.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">Qtr</th>}
            <th className="px-1.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Resource
            </th>
            <th className={head} title="Physically present">Have</th>
            <th className={head} title="Held by active reservations">Resv</th>
            <th className={head} title="Committed to transfers not yet delivered">Cmtd</th>
            <th className={head} title="Present minus reserved minus committed">Free</th>
            <th className={head} title="Retention minimum — must never go below">Keep</th>
            <th className={head} title="Transferable surplus">Send</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => {
            const blocked = s.transferableSurplus === 0;
            return (
              <tr
                key={`${s.districtCode}-${s.resourceCode}`}
                className={`border-b border-white/5 ${onPick ? 'cursor-pointer hover:bg-white/5' : ''}`}
                onClick={() => onPick?.(s)}
              >
                {showDistrict && (
                  <td className="px-1.5 py-2 text-sm font-mono font-semibold">{s.districtCode}</td>
                )}
                <td className="px-1.5 py-2 text-sm leading-tight">{humanResource(s.resourceCode)}</td>
                <td className={num}>{s.currentQuantity}</td>
                <td className={`${num} text-slate-500`}>{s.reservedQuantity}</td>
                <td className={`${num} text-slate-500`}>{s.committedOutbound}</td>
                <td className={num}>{s.available}</td>
                <td className={`${num} text-amber-300/90`}>{s.retentionMinimum}</td>
                <td
                  className={`${num} font-semibold ${blocked ? 'text-rose-400' : 'text-emerald-300'}`}
                >
                  {s.transferableSurplus}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-500">
        <span className="text-amber-300/90">Keep</span> is the retention floor,{' '}
        <span className="text-emerald-300">Send</span> what may actually leave the quarter.
      </p>
    </div>
  );
}
