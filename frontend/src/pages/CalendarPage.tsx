import { useCallback, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useAsync';
import { useRealtimeEvent } from '../hooks/useRealtime';
import { KaijuEvent } from '../types/events';
import { OperationalCalendar } from '../components/OperationalCalendar';
import { Card, Spinner } from '../components/ui';

export function CalendarPage() {
  const { user } = useAuth();
  const scope = user?.role === 'QC' ? (user.districtCode ?? undefined) : undefined;

  const reservations = useAsync(() => api.reservations(scope), [scope]);
  const transfers = useAsync(() => api.transfers(scope ? { district: scope } : {}), [scope]);

  const refresh = useCallback(() => {
    reservations.reload();
    transfers.reload();
  }, [reservations, transfers]);

  useRealtimeEvent(KaijuEvent.RESOURCE_UPDATED, refresh);
  useRealtimeEvent(KaijuEvent.TRANSFER_CREATED, refresh);
  useRealtimeEvent(KaijuEvent.TRANSFER_UPDATED, refresh);

  const [days, setDays] = useState(7);
  const loading = (reservations.loading && !reservations.data) || (transfers.loading && !transfers.data);

  return (
    <Card
      title={scope ? `Operational calendar — quarter ${scope}` : 'Operational calendar — city'}
      action={
        <div className="flex items-center gap-1">
          {[2, 7, 14].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded px-2 py-1 text-xs ${
                d === days ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <Spinner />
      ) : (
        <OperationalCalendar
          reservations={reservations.data ?? []}
          transfers={transfers.data ?? []}
          days={days}
        />
      )}
    </Card>
  );
}
