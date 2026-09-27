import { useCallback, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useCity } from '../hooks/useCity';
import { useRealtimeEvent } from '../hooks/useRealtime';
import { KaijuEvent } from '../types/events';
import type { DistrictCode, RoutesView, TransferMode } from '../types/api';
import { CityMap } from '../components/CityMap';
import { StockTable } from '../components/StockTable';
import { TransferTable, type TransferAction } from '../components/TransferTable';
import { LevelBanner } from '../components/LevelBanner';
import { AlertFeed } from '../components/AlertFeed';
import { Badge, Card, Empty, ErrorNotice, Field, Spinner } from '../components/ui';
import { humanResource } from '../lib/format';

const CODES: DistrictCode[] = ['A', 'E', 'W', 'X', 'Z'];

// The whole city, a route planner, and transit chains from level 4.
// No reserve button and no approve button: the matrix does not grant them.
export function LogisticsDashboard() {
  const city = useCity();
  const catastrophe = useAsync(() => api.catastrophe(), []);
  const resources = useAsync(() => api.resourceTypes(), []);
  const transfers = useAsync(() => api.transfers(), []);

  const [resourceCode, setResourceCode] = useState('MEDICAL_PERSONNEL');
  const availability = useAsync(() => api.availability(resourceCode), [resourceCode]);

  const [error, setError] = useState<ApiError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [routePreview, setRoutePreview] = useState<RoutesView | null>(null);
  const [focused, setFocused] = useState<DistrictCode | null>(null);

  const refresh = useCallback(() => {
    transfers.reload();
    availability.reload();
  }, [transfers, availability]);

  useRealtimeEvent(KaijuEvent.RESOURCE_UPDATED, () => availability.reload());
  useRealtimeEvent(KaijuEvent.TRANSFER_CREATED, refresh);
  useRealtimeEvent(KaijuEvent.TRANSFER_UPDATED, refresh);
  useRealtimeEvent(KaijuEvent.CATASTROPHE_LEVEL_CHANGED, () => {
    catastrophe.reload();
    refresh();
  });

  const actions: TransferAction[] = [
    {
      label: 'Cancel',
      tone: 'danger',
      visible: (t) =>
        ['PENDING_SOURCE_APPROVAL', 'PENDING_TRANSIT_APPROVAL', 'APPROVED'].includes(t.status),
      run: async (t) => {
        setBusyId(t.id);
        setError(null);
        try {
          await api.rejectTransfer(t.id, 'Cancelled by logistics');
          refresh();
        } catch (e) {
          setError(
            e instanceof ApiError ? e : new ApiError(0, 'NETWORK_ERROR', 'Server unreachable.'),
          );
        } finally {
          setBusyId(null);
        }
      },
    },
  ];

  return (
    <div className="space-y-4">
      {catastrophe.data && <LevelBanner catastrophe={catastrophe.data} />}
      <ErrorNotice error={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Tokyork" className="lg:col-span-1">
          {city.districts.length > 0 ? (
            <CityMap
              districts={city.districts}
              selected={focused}
              highlighted={routePreview?.routes[0]?.transitDistricts ?? []}
              onSelect={(code) => setFocused(code === focused ? null : code)}
              hint="Click a quarter to filter the availability table and set it as the chain source."
              tooltip={(d) => {
                const row = (availability.data ?? []).find((s) => s.districtCode === d.code);
                if (!row) return null;
                return (
                  <p className="text-slate-300">
                    {row.resourceName}:{' '}
                    <span className="font-mono text-slate-100">{row.available}</span> free,{' '}
                    <span
                      className={`font-mono font-semibold ${
                        row.transferableSurplus === 0 ? 'text-rose-400' : 'text-emerald-300'
                      }`}
                    >
                      {row.transferableSurplus}
                    </span>{' '}
                    can leave
                  </p>
                );
              }}
            />
          ) : (
            <Spinner />
          )}
        </Card>

        <Card
          title="City-wide availability"
          className="lg:col-span-2"
          action={
            <select
              className="input !w-auto !py-1 !text-xs"
              value={resourceCode}
              onChange={(e) => setResourceCode(e.target.value)}
            >
              {(resources.data ?? []).map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          }
        >
          {availability.loading && !availability.data ? (
            <Spinner />
          ) : (
            <StockTable
              stocks={(availability.data ?? []).filter((s) => !focused || s.districtCode === focused)}
              showDistrict
              onPick={(stock) =>
                setFocused(stock.districtCode === focused ? null : stock.districtCode)
              }
            />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Route planner">
          <RoutePlanner onPreview={setRoutePreview} preview={routePreview} />
        </Card>

        <Card title="Organise a transfer chain" className="lg:col-span-2">
          <ChainForm
            resources={(resources.data ?? []).map((r) => r.code)}
            initialSource={focused}
            initialResource={resourceCode}
            onDone={refresh}
            onError={setError}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="All transfers" className="lg:col-span-2">
          <TransferTable transfers={transfers.data ?? []} actions={actions} busyId={busyId} />
        </Card>
        <Card title="Live alerts">
          <AlertFeed />
        </Card>
      </div>
    </div>
  );
}

function RoutePlanner({
  preview,
  onPreview,
}: {
  preview: RoutesView | null;
  onPreview: (r: RoutesView | null) => void;
}) {
  const [from, setFrom] = useState<DistrictCode>('A');
  const [to, setTo] = useState<DistrictCode>('Z');
  const [busy, setBusy] = useState(false);

  const compute = async () => {
    setBusy(true);
    try {
      onPreview(await api.routes(from, to));
    } catch {
      onPreview(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="From">
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value as DistrictCode)}>
            {CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To">
          <select className="input" value={to} onChange={(e) => setTo(e.target.value as DistrictCode)}>
            {CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button onClick={compute} disabled={busy || from === to} className="btn-ghost w-full">
        {busy ? 'Computing…' : 'Show every legal route'}
      </button>

      {preview && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            {preview.adjacent ? 'Quarters are adjacent.' : 'Quarters are NOT adjacent.'}
          </p>
          {preview.routes.length === 0 ? (
            <Empty>No route.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {preview.routes.map((route, i) => (
                <li
                  key={`${route.mode}-${i}`}
                  className="rounded-md border border-white/10 bg-ink-900/60 p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge>{route.mode}</Badge>
                    <span className="font-mono text-slate-400">{route.totalEtaHours} h</span>
                  </div>
                  <p className="mt-1 font-mono text-slate-300">
                    {[route.legs[0]?.from, ...route.legs.map((l) => l.to)].join(' → ')}
                  </p>
                  {route.transitDistricts.length > 0 && (
                    <p className="mt-0.5 text-amber-300/80">
                      Approval needed from {route.transitDistricts.join(', ')}
                    </p>
                  )}
                  {i === 0 && <p className="mt-0.5 text-emerald-300/80">Preferred by the engine</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ChainForm({
  resources,
  initialSource,
  initialResource,
  onDone,
  onError,
}: {
  resources: string[];
  initialSource: DistrictCode | null;
  initialResource: string;
  onDone: () => void;
  onError: (e: ApiError) => void;
}) {
  const [sourceOverride, setSourceOverride] = useState<DistrictCode | null>(null);
  const source = sourceOverride ?? initialSource ?? 'E';
  const setSource = (code: DistrictCode) => setSourceOverride(code);
  const [destination, setDestination] = useState<DistrictCode>('Z');
  const [resourceOverride, setResourceOverride] = useState<string | null>(null);
  const resourceCode = resourceOverride ?? initialResource ?? resources[0] ?? '';
  const setResourceCode = (code: string) => setResourceOverride(code);
  const [quantity, setQuantity] = useState(1);
  const [mode, setMode] = useState<TransferMode | ''>('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createTransfer({
        sourceDistrict: source,
        destinationDistrict: destination,
        resourceCode,
        quantity,
        mode: mode === '' ? undefined : mode,
      });
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
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-5">
      <Field label="From">
        <select className="input" value={source} onChange={(e) => setSource(e.target.value as DistrictCode)}>
          {CODES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="To">
        <select
          className="input"
          value={destination}
          onChange={(e) => setDestination(e.target.value as DistrictCode)}
        >
          {CODES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Resource">
        <select className="input" value={resourceCode} onChange={(e) => setResourceCode(e.target.value)}>
          {resources.map((r) => (
            <option key={r} value={r}>
              {humanResource(r)}
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
        />
      </Field>
      <Field label="Route">
        <select className="input" value={mode} onChange={(e) => setMode(e.target.value as TransferMode | '')}>
          <option value="">Automatic</option>
          <option value="DIRECT">Direct</option>
          <option value="TRANSIT">Transit</option>
          <option value="MARITIME">Maritime</option>
        </select>
      </Field>

      <div className="sm:col-span-5">
        <button className="btn-primary" disabled={busy || source === destination}>
          {busy ? 'Submitting…' : 'Submit chain'}
        </button>
        <span className="ml-3 text-[11px] text-slate-500">
          Transit chains unlock at level 4. Adjacent quarters must be solicited first.
        </span>
      </div>
    </form>
  );
}
