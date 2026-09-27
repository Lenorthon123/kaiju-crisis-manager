import { useRealtime } from '../hooks/useRealtime';
import { formatTime } from '../lib/format';

const TONES: Record<string, string> = {
  info: 'border-sky-500/30 bg-sky-500/10',
  warning: 'border-amber-500/30 bg-amber-500/10',
  danger: 'border-rose-500/40 bg-rose-500/10',
};

export function AlertFeed() {
  const { alerts, dismissAlert, connected } = useRealtime();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            connected ? 'bg-emerald-400' : 'bg-slate-600'
          }`}
        />
        {connected ? 'Live feed connected' : 'Live feed offline'}
      </div>

      {alerts.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">No alert yet.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id} className={`rounded-md border p-3 ${TONES[alert.severity]}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">{alert.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{alert.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <time className="font-mono text-[11px] text-slate-500">
                    {formatTime(alert.at)}
                  </time>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="text-slate-500 hover:text-slate-300"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
