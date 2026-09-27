import type { Reservation } from '../types/api';
import { formatShort, humanResource } from '../lib/format';
import { Empty } from './ui';

// Releasing matters: reserved units are subtracted from what may leave the
// quarter, so a forgotten reservation quietly shrinks the transferable surplus.
export function ReservationList({
  reservations,
  onRelease,
  busyId,
  showDistrict = false,
}: {
  reservations: Reservation[];
  onRelease?: (reservation: Reservation) => void;
  busyId?: string | null;
  showDistrict?: boolean;
}) {
  const active = reservations.filter((r) => r.status === 'ACTIVE');
  if (active.length === 0) return <Empty>No active reservation.</Empty>;

  return (
    <ul className="space-y-2">
      {active.map((reservation) => (
        <li
          key={reservation.id}
          className="flex items-center gap-3 rounded-md border border-white/10 bg-ink-900/50 p-2.5"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-100">
              <span className="font-mono font-semibold">{reservation.quantity}×</span>{' '}
              {humanResource(reservation.resourceType.code)}
              {showDistrict && (
                <span className="ml-1 font-mono text-slate-500">· {reservation.district.code}</span>
              )}
            </p>
            <p className="font-mono text-[11px] text-slate-500">
              {formatShort(reservation.startAt)} → {formatShort(reservation.endAt)}
            </p>
          </div>

          {onRelease && (
            <button
              className="btn-ghost shrink-0 !px-2 !py-1 !text-xs"
              disabled={busyId === reservation.id}
              onClick={() => onRelease(reservation)}
            >
              {busyId === reservation.id ? '…' : 'Release'}
            </button>
          )}
        </li>
      ))}
      <li className="pt-1 text-[11px] text-slate-500">
        Reserved units count against what the quarter may send. They are given back
        automatically when the window closes.
      </li>
    </ul>
  );
}
