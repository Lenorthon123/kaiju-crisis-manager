import { useCallback, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useAsync';
import { useCity } from '../hooks/useCity';
import { useRealtimeEvent } from '../hooks/useRealtime';
import { KaijuEvent } from '../types/events';
import type { DistrictCode, StockView, Transfer } from '../types/api';
import { CityMap } from '../components/CityMap';
import { StockTable } from '../components/StockTable';
import { TransferTable, type TransferAction } from '../components/TransferTable';
import { LevelBanner } from '../components/LevelBanner';
import { AlertFeed } from '../components/AlertFeed';
import { ReservationList } from '../components/ReservationList';
import { Card, Empty, ErrorNotice, Field, Spinner } from '../components/ui';
import { DISTRICT_NAMES, humanResource } from '../lib/format';

// My stock, my approval queue, requests towards my own quarter. Nothing
// city-wide, because nothing city-wide is this officer's job.
export function QuarterDashboard() {
  const { user } = useAuth();
  const quarter = user?.districtCode as DistrictCode;

  const city = useCity();
  const catastrophe = useAsync(() => api.catastrophe(), []);
  const stocks = useAsync(() => api.stocks(quarter), [quarter]);
  const pending = useAsync(() => api.pendingTransfers(quarter), [quarter]);
  const mine = useAsync(() => api.transfers({ district: quarter }), [quarter]);
  const reservations = useAsync(() => api.reservations(quarter), [quarter]);

  const [error, setError] = useState<ApiError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [requestSource, setRequestSource] = useState<DistrictCode | ''>('');

  const refreshAll = useCallback(() => {
    stocks.reload();
    pending.reload();
    mine.reload();
    reservations.reload();
  }, [stocks, pending, mine, reservations]);

  useRealtimeEvent(KaijuEvent.RESOURCE_UPDATED, () => {
    stocks.reload();
    reservations.reload();
  });
  useRealtimeEvent(KaijuEvent.TRANSFER_CREATED, refreshAll);
  useRealtimeEvent(KaijuEvent.TRANSFER_UPDATED, refreshAll);
  useRealtimeEvent(KaijuEvent.CATASTROPHE_LEVEL_CHANGED, () => {
    catastrophe.reload();
    refreshAll();
  });

  const adjacent: DistrictCode[] = city.adjacentTo(quarter);

  const act = async (id: string, run: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await run();
      refreshAll();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK_ERROR', 'Server unreachable.'));
    } finally {
      setBusyId(null);
    }
  };

  const approvalActions: TransferAction[] = [
    {
      label: 'Approve',
      tone: 'primary',
      visible: (t) => t.status === 'PENDING_SOURCE_APPROVAL' && t.source.code === quarter,
      run: (t) => void act(t.id, () => api.approveTransfer(t.id)),
    },
    {
      label: 'Transit',
      tone: 'primary',
      visible: (t) =>
        t.status === 'PENDING_TRANSIT_APPROVAL' &&
        t.legs.some((l) => l.approvalRequired && l.status === 'PENDING' && l.fromNode === quarter),
      run: (t) => {
        const leg = t.legs.find(
          (l) => l.approvalRequired && l.status === 'PENDING' && l.fromNode === quarter,
        );
        if (leg) void act(t.id, () => api.approveLeg(t.id, leg.id));
      },
    },
    {
      label: 'Refuse',
      tone: 'danger',
      visible: (t) =>
        ['PENDING_SOURCE_APPROVAL', 'PENDING_TRANSIT_APPROVAL'].includes(t.status),
      run: (t) => void act(t.id, () => api.rejectTransfer(t.id, 'Needed locally')),
    },
    {
      label: 'Delivered',
      visible: (t) =>
        ['APPROVED', 'IN_TRANSIT'].includes(t.status) && t.destination.code === quarter,
      run: (t) => void act(t.id, () => api.deliverTransfer(t.id)),
    },
  ];

  if (!quarter) return <Empty>This account is not attached to a quarter.</Empty>;

  return (
    <div className="space-y-4">
      {catastrophe.data && <LevelBanner catastrophe={catastrophe.data} />}
      <ErrorNotice error={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Tokyork" className="lg:col-span-1">
          {city.districts.length > 0 ? (
            <CityMap
              districts={city.districts}
              selected={requestSource || quarter}
              disabled={city.districts
                .map((d) => d.code)
                .filter((code) => code !== quarter && !adjacent.includes(code))}
              onSelect={(code) => setRequestSource(code === requestSource || code === quarter ? '' : code)}
              hint="Click a bordering quarter to request a transfer from it."
              tooltip={(d) => {
                const rows = (stocks.data ?? []).filter((s) => s.districtCode === d.code);
                if (d.code === quarter) {
                  const blocked = rows.filter((s) => s.transferableSurplus === 0).length;
                  return (
                    <p className="text-slate-300">
                      Your quarter · {blocked} resource{blocked === 1 ? '' : 's'} at the retention floor
                    </p>
                  );
                }
                return (
                  <p className="text-slate-300">
                    {adjacent.includes(d.code)
                      ? 'Bordering — click to request from here'
                      : 'Not adjacent to your quarter'}
                  </p>
                );
              }}
            />
          ) : (
            <Spinner />
          )}
        </Card>

        <Card title={`Stock — ${DISTRICT_NAMES[quarter]}`} className="lg:col-span-2">
          {stocks.loading && !stocks.data ? (
            <Spinner />
          ) : (
            <StockTable stocks={stocks.data ?? []} />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card
            title="Awaiting my approval"
            action={
              <span className="text-xs text-slate-500">
                ordered by priority — transit through Xeno comes last
              </span>
            }
          >
            <TransferTable
              transfers={pending.data ?? []}
              actions={approvalActions}
              busyId={busyId}
            />
          </Card>

          <Card title="Transfers involving my quarter">
            <TransferTable
              transfers={mine.data ?? []}
              actions={approvalActions}
              busyId={busyId}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Reserve within my quarter">
            <ReservationForm
              quarter={quarter}
              stocks={stocks.data ?? []}
              onDone={() => {
                stocks.reload();
                reservations.reload();
                setError(null);
              }}
              onError={setError}
            />
          </Card>

          <Card title="My active reservations">
            <ReservationList
              reservations={reservations.data ?? []}
              busyId={busyId}
              onRelease={(reservation) =>
                void act(reservation.id, () => api.releaseReservation(reservation.id))
              }
            />
          </Card>

          <Card title="Request a transfer">
            <RequestForm
              quarter={quarter}
              onDone={refreshAll}
              onError={setError}
              adjacent={adjacent}
              source={requestSource}
              onSourceChange={setRequestSource}
            />
          </Card>

          <Card title="Live alerts">
            <AlertFeed />
          </Card>
        </div>
      </div>
    </div>
  );
}

function ReservationForm({
  quarter,
  stocks,
  onDone,
  onError,
}: {
  quarter: DistrictCode;
  stocks: StockView[];
  onDone: () => void;
  onError: (e: ApiError) => void;
}) {
  const [resourceCode, setResourceCode] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const startAt = new Date(Date.now() + 3_600_000).toISOString();
      const endAt = new Date(Date.now() + 5 * 3_600_000).toISOString();
      await api.createReservation({ districtCode: quarter, resourceCode, quantity, startAt, endAt });
      onDone();
    } catch (err) {
      onError(
        err instanceof ApiError ? err : new ApiError(0, 'NETWORK_ERROR', 'Server unreachable.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Resource">
        <select
          className="input"
          value={resourceCode}
          onChange={(e) => setResourceCode(e.target.value)}
          required
        >
          <option value="">Choose…</option>
          {stocks.map((s) => (
            <option key={s.resourceCode} value={s.resourceCode}>
              {humanResource(s.resourceCode)} · {s.available} available
            </option>
          ))}
        </select>
      </Field>

      <Field label="Quantity">
        <input
          className="input"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          required
        />
      </Field>

      <button className="btn-primary w-full" disabled={busy || !resourceCode}>
        {busy ? 'Reserving…' : 'Reserve'}
      </button>
      <p className="text-[11px] text-slate-500">
        Reservations open at level 2. The server refuses anything earlier.
      </p>
    </form>
  );
}

function RequestForm({
  quarter,
  adjacent,
  source,
  onSourceChange,
  onDone,
  onError,
}: {
  quarter: DistrictCode;
  adjacent: DistrictCode[];
  source: DistrictCode | '';
  onSourceChange: (code: DistrictCode | '') => void;
  onDone: () => void;
  onError: (e: ApiError) => void;
}) {
  const resources = useAsync(() => api.resourceTypes(), []);
  const [resourceCode, setResourceCode] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Transfer | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!source) return;
    setBusy(true);
    setCreated(null);
    try {
      const transfer = await api.createTransfer({
        sourceDistrict: source,
        destinationDistrict: quarter,
        resourceCode,
        quantity,
      });
      setCreated(transfer);
      onDone();
    } catch (err) {
      onError(
        err instanceof ApiError ? err : new ApiError(0, 'NETWORK_ERROR', 'Server unreachable.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="From (adjacent quarters)">
        <select
          className="input"
          value={source}
          onChange={(e) => onSourceChange(e.target.value as DistrictCode | '')}
          required
        >
          <option value="">Choose…</option>
          {adjacent.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Resource">
        <select
          className="input"
          value={resourceCode}
          onChange={(e) => setResourceCode(e.target.value)}
          required
        >
          <option value="">Choose…</option>
          {(resources.data ?? []).map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Quantity">
        <input
          className="input"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          required
        />
      </Field>

      <button className="btn-primary w-full" disabled={busy || !source || !resourceCode}>
        {busy ? 'Requesting…' : 'Request'}
      </button>

      {created && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200">
          Request sent — {created.mode}, awaiting {created.source.code}'s approval.
        </p>
      )}
      <p className="text-[11px] text-slate-500">
        A Quarter Coordinator may only pull towards its own quarter, from an adjacent one, from
        level 3.
      </p>
    </form>
  );
}
