import type { Transfer } from '../types/api';
import { STATUS_LABELS, STATUS_TONES, formatShort, humanResource } from '../lib/format';
import { Badge, Empty } from './ui';

interface Action {
  label: string;
  tone?: 'primary' | 'ghost' | 'danger';
  visible: (t: Transfer) => boolean;
  run: (t: Transfer) => void;
}

export function TransferTable({
  transfers,
  actions = [],
  busyId,
}: {
  transfers: Transfer[];
  actions?: Action[];
  busyId?: string | null;
}) {
  if (transfers.length === 0) return <Empty>No transfer.</Empty>;

  return (
    <div className="overflow-x-auto">
      {/* Actions are pinned right: if the table has to scroll, the buttons must not
          be the thing that disappears. */}
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-white/10">
            <th className="th">Route</th>
            <th className="th">Resource</th>
            <th className="th text-right">Qty</th>
            <th className="th">Mode</th>
            <th className="th">Status</th>
            <th className="th">ETA</th>
            <th className="th hidden 2xl:table-cell">Requested by</th>
            {actions.length > 0 && (
              <th className="th sticky right-0 whitespace-nowrap bg-ink-800 text-right">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => {
            const transit = t.legs.filter((l) => l.approvalRequired).map((l) => l.fromNode);
            return (
              <tr key={t.id} className="border-b border-white/5 align-middle">
                <td className="td whitespace-nowrap font-mono">
                  {t.source.code}
                  <span className="mx-1 text-slate-600">
                    {transit.length > 0 ? `→ ${transit.join(' → ')} →` : '→'}
                  </span>
                  {t.destination.code}
                </td>
                <td className="td">{humanResource(t.resourceType.code)}</td>
                <td className="td text-right font-mono">{t.quantity}</td>
                <td className="td whitespace-nowrap">
                  <Badge
                    tone={
                      t.mode === 'MARITIME'
                        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                        : t.mode === 'TRANSIT'
                          ? 'border-violet-500/30 bg-violet-500/10 text-violet-300'
                          : ''
                    }
                  >
                    {t.mode}
                  </Badge>
                  {t.isRequisition && (
                    <Badge tone="ml-1 border-rose-500/30 bg-rose-500/10 text-rose-300">REQ</Badge>
                  )}
                </td>
                <td className="td whitespace-nowrap">
                  <Badge tone={STATUS_TONES[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                </td>
                <td className="td whitespace-nowrap font-mono text-xs text-slate-400">
                  {formatShort(t.estimatedDeliveryAt)}
                </td>
                <td className="td hidden text-xs text-slate-400 2xl:table-cell">
                  {t.initiator.displayName}
                  <span className="ml-1 text-slate-600">({t.initiator.role})</span>
                </td>
                {actions.length > 0 && (
                  <td className="td sticky right-0 whitespace-nowrap bg-ink-800">
                    <div className="flex justify-end gap-1.5">
                      {actions
                        .filter((a) => a.visible(t))
                        .map((a) => (
                          <button
                            key={a.label}
                            disabled={busyId === t.id}
                            onClick={() => a.run(t)}
                            className={
                              a.tone === 'danger'
                                ? 'btn-danger !px-2 !py-1 !text-xs'
                                : a.tone === 'primary'
                                  ? 'btn-primary !px-2 !py-1 !text-xs'
                                  : 'btn-ghost !px-2 !py-1 !text-xs'
                            }
                          >
                            {a.label}
                          </button>
                        ))}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type { Action as TransferAction };
