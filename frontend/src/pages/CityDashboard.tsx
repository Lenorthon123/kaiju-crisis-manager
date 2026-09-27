import { useCallback, useState } from 'react';
import { ApiError, api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useCity } from '../hooks/useCity';
import { useRealtimeEvent } from '../hooks/useRealtime';
import { KaijuEvent } from '../types/events';
import type { DistrictCode } from '../types/api';
import { CityMap } from '../components/CityMap';
import { StockTable } from '../components/StockTable';
import { TransferTable } from '../components/TransferTable';
import { LevelBanner } from '../components/LevelBanner';
import { AlertFeed } from '../components/AlertFeed';
import { Card, ErrorNotice, Field, Spinner } from '../components/ui';
import {
  DISTRICT_NAMES,
  LEVEL_NAMES,
  SEVERITY_COLORS,
  formatDateTime,
  humanResource,
} from '../lib/format';

// The levers only this role holds. Note there is no reserve button either —
// the matrix gives RESERVE_OWN_QUARTER to QC only (docs/decisions.md, D7).
export function CityDashboard() {
  const city = useCity();
  const catastrophe = useAsync(() => api.catastrophe(), []);
  const history = useAsync(() => api.catastropheHistory(), []);
  const stocks = useAsync(() => api.stocks(), []);
  const transfers = useAsync(() => api.transfers(), []);

  const [selected, setSelected] = useState<DistrictCode | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    city.reload();
    catastrophe.reload();
    history.reload();
    stocks.reload();
    transfers.reload();
  }, [city, catastrophe, history, stocks, transfers]);

  useRealtimeEvent(KaijuEvent.CATASTROPHE_LEVEL_CHANGED, refresh);
  useRealtimeEvent(KaijuEvent.RESOURCE_UPDATED, () => stocks.reload());
  useRealtimeEvent(KaijuEvent.TRANSFER_UPDATED, () => transfers.reload());
  useRealtimeEvent(KaijuEvent.RETENTION_THRESHOLD_CHANGED, () => stocks.reload());

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK_ERROR', 'Server unreachable.'));
    } finally {
      setBusy(false);
    }
  };

  const level = catastrophe.data?.level ?? 1;

  return (
    <div className="space-y-4">
      {catastrophe.data && <LevelBanner catastrophe={catastrophe.data} />}
      <ErrorNotice error={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Tokyork" className="lg:col-span-1">
          {city.districts.length > 0 ? (
            <CityMap
              districts={city.districts}
              selected={selected}
              onSelect={(code) => setSelected(code === selected ? null : code)}
              hint="Click a quarter to filter the stock table below."
              tooltip={(d) => {
                const rows = (stocks.data ?? []).filter((s) => s.districtCode === d.code);
                if (rows.length === 0) return null;
                const blocked = rows.filter((s) => s.transferableSurplus === 0);
                return (
                  <p className={blocked.length > 0 ? 'text-rose-300' : 'text-emerald-300'}>
                    {blocked.length === 0
                      ? 'All resources above the retention floor'
                      : `${blocked.length} resource${blocked.length === 1 ? '' : 's'} at the floor: ${blocked
                          .map((s) => humanResource(s.resourceCode))
                          .slice(0, 2)
                          .join(', ')}${blocked.length > 2 ? '…' : ''}`}
                  </p>
                );
              }}
            />
          ) : (
            <Spinner />
          )}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card title="Escalation">
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((l) => (
                <button
                  key={l}
                  disabled={busy || l === level}
                  onClick={() => void run(() => api.setCatastropheLevel(l))}
                  className={`btn font-semibold text-ink-900 ${
                    l === level ? 'ring-2 ring-white/80 !opacity-100' : ''
                  }`}
                  style={{ backgroundColor: SEVERITY_COLORS[l] }}
                >
                  {l} · {LEVEL_NAMES[l]}
                  {l === level && <span className="ml-1 text-[10px] uppercase">· now</span>}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Every change is broadcast to all connected officers. Dropping below level 5 revokes any
              lowered retention threshold.
            </p>
          </Card>

          <Card title="Quarter severity">
            {city.districts.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-5">
                {city.districts.map((d) => (
                  <Field key={d.code} label={`${d.code} · ${DISTRICT_NAMES[d.code]}`}>
                    <select
                      className="input"
                      value={d.severity}
                      disabled={busy}
                      onChange={(e) => {
                        const severity = Number(e.target.value);
                        city.applySeverity(d.code, severity); // optimistic recolour
                        void run(() => api.setSeverity(d.code, severity));
                      }}
                    >
                      {[1, 2, 3, 4, 5].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            ) : (
              <Spinner />
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              Severity colours the map and prioritises requests. It is not the catastrophe level and
              does not change anyone's permissions.
            </p>
          </Card>

          <Card title="Retention threshold">
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn-danger"
                disabled={busy || level !== 5}
                onClick={() => void run(() => api.lowerRetention(0.15))}
              >
                Lower city-wide to 15%
              </button>
              {level !== 5 && (
                <span className="text-xs text-amber-300/80">
                  Available at level 5 only — currently level {level}.
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Emergency measure: it frees units that quarters would otherwise have to keep. Revoked
              automatically on de-escalation.
            </p>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title={
            selected
              ? `Stock — ${DISTRICT_NAMES[selected]}`
              : 'Stock — whole city (click a quarter on the map to filter)'
          }
          className="lg:col-span-2"
        >
          {stocks.loading && !stocks.data ? (
            <Spinner />
          ) : (
            <StockTable
              stocks={(stocks.data ?? []).filter((s) => !selected || s.districtCode === selected)}
              showDistrict
              maxHeight={selected ? undefined : 520}
            />
          )}
        </Card>

        <Card title="Live alerts">
          <AlertFeed />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="All transfers" className="lg:col-span-2">
          <TransferTable transfers={transfers.data ?? []} />
        </Card>

        <Card title="Level history">
          {(history.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">No change recorded.</p>
          ) : (
            <ul className="space-y-2">
              {(history.data ?? []).map((h) => (
                <li key={h.id} className="rounded-md border border-white/10 p-2 text-xs">
                  <p className="text-slate-200">
                    {h.previousLevel} → {h.newLevel}{' '}
                    <span className="text-slate-500">by {h.changedBy.displayName}</span>
                  </p>
                  <p className="text-slate-500">{formatDateTime(h.changedAt)}</p>
                  {h.reason && <p className="mt-0.5 italic text-slate-400">{h.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
