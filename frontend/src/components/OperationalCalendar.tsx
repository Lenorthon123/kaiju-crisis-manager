import { useMemo } from 'react';
import type { Reservation, Transfer } from '../types/api';
import { humanResource } from '../lib/format';

interface Entry {
  id: string;
  kind: 'RESERVATION' | 'TRANSFER';
  label: string;
  detail: string;
  start: Date;
  end: Date;
}

const DAY_MS = 86_400_000;

export function OperationalCalendar({
  reservations,
  transfers,
  days = 7,
}: {
  reservations: Reservation[];
  transfers: Transfer[];
  days?: number;
}) {
  const start = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const columns = useMemo(
    () => Array.from({ length: days }, (_, i) => new Date(start.getTime() + i * DAY_MS)),
    [start, days],
  );

  const entries = useMemo<Entry[]>(() => {
    const fromReservations: Entry[] = reservations
      .filter((r) => r.status === 'ACTIVE')
      .map((r) => ({
        id: `res-${r.id}`,
        kind: 'RESERVATION',
        label: `${r.quantity}× ${humanResource(r.resourceType.code)}`,
        detail: `Reserved in ${r.district.code}`,
        start: new Date(r.startAt),
        end: new Date(r.endAt),
      }));

    const fromTransfers: Entry[] = transfers
      .filter((t) => !['REJECTED', 'CANCELLED'].includes(t.status))
      .map((t) => ({
        id: `tr-${t.id}`,
        kind: 'TRANSFER',
        label: `${t.quantity}× ${humanResource(t.resourceType.code)}`,
        detail: `${t.source.code} → ${t.destination.code} (${t.mode})`,
        start: new Date(t.requestedAt),
        end: new Date(t.estimatedDeliveryAt ?? t.deliveredAt ?? t.requestedAt),
      }));

    return [...fromReservations, ...fromTransfers].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );
  }, [reservations, transfers]);

  const windowEnd = new Date(start.getTime() + days * DAY_MS);
  const visible = entries.filter((e) => e.end >= start && e.start <= windowEnd);

  const total = days * DAY_MS;

  const geometry = (entry: Entry) => {
    const from = Math.max(0, entry.start.getTime() - start.getTime());
    const to = Math.min(total, entry.end.getTime() - start.getTime());
    const left = (from / total) * 100;
    const width = Math.max(0.8, ((to - from) / total) * 100);
    return { left, width };
  };

  // A two-hour transfer on a seven-day scale is a sliver. Below this width the
  // label goes beside the bar instead of being clipped to "3x".
  const LABEL_INSIDE_MIN = 16;

  const nowOffset = ((Date.now() - start.getTime()) / total) * 100;

  return (
    <div className="space-y-2">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
        {columns.map((day) => (
          <div
            key={day.toISOString()}
            className="border-l border-white/10 px-2 py-1 text-center text-[11px] text-slate-400 first:border-l-0"
          >
            {day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
          </div>
        ))}
      </div>

      <div className="relative rounded-md border border-white/10 bg-ink-900/60">
        <div
          className="pointer-events-none absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}
        >
          {columns.map((day) => (
            <div key={day.toISOString()} className="border-l border-white/5 first:border-l-0" />
          ))}
        </div>

        {nowOffset >= 0 && nowOffset <= 100 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-rose-400/70"
            style={{ left: `${nowOffset}%` }}
          >
            <span className="absolute -top-0.5 -left-1 h-2 w-2 rounded-full bg-rose-400" />
          </div>
        )}

        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Nothing scheduled over the next {days} days.
          </p>
        ) : (
          <ul className="relative space-y-1.5 p-2">
            {visible.map((entry) => {
              const { left, width } = geometry(entry);
              const inside = width >= LABEL_INSIDE_MIN;
              const text = `${entry.label} · ${entry.detail}`;
              const tone =
                entry.kind === 'RESERVATION'
                  ? 'bg-amber-500/30 ring-amber-400/40'
                  : 'bg-sky-500/30 ring-sky-400/40';

              return (
                <li key={entry.id} className="relative h-7">
                  <div
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={text}
                    className={`absolute flex h-7 items-center overflow-hidden whitespace-nowrap rounded px-2
                                text-[11px] font-medium text-slate-100 ring-1 ${tone}`}
                  >
                    {inside && text}
                  </div>
                  {!inside && (
                    <span
                      style={{ left: `calc(${Math.min(left + width, 88)}% + 8px)` }}
                      className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap
                                 text-[11px] text-slate-300"
                    >
                      {text}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500/60" /> Reservation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500/60" /> Transfer
        </span>
      </div>
    </div>
  );
}
