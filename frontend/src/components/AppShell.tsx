import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRealtime } from '../hooks/useRealtime';
import { DISTRICT_NAMES, ROLE_NAMES } from '../lib/format';

// Navigation follows the role. Convenience only — the server refuses these
// routes anyway, and that is where the boundary lives.
const NAV = {
  QC: [
    { to: '/quarter', label: 'My quarter' },
    { to: '/calendar', label: 'Calendar' },
  ],
  LC: [
    { to: '/logistics', label: 'Logistics' },
    { to: '/calendar', label: 'Calendar' },
  ],
  CD: [
    { to: '/city', label: 'City' },
    { to: '/calendar', label: 'Calendar' },
  ],
} as const;

export function AppShell() {
  const { user, logout } = useAuth();
  const { connected } = useRealtime();
  if (!user) return null;

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-ink-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-mono text-sm font-bold tracking-tight text-slate-100">KAIJU_</span>

          <nav className="flex items-center gap-1">
            {NAV[user.role].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${
                    isActive ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-xs">
            <span
              title={connected ? 'Real-time feed connected' : 'Real-time feed offline'}
              className={`inline-block h-2 w-2 rounded-full ${
                connected ? 'bg-emerald-400' : 'bg-slate-600'
              }`}
            />
            <div className="text-right">
              <p className="text-slate-200">{user.displayName}</p>
              <p className="text-slate-500">
                {ROLE_NAMES[user.role]}
                {user.districtCode ? ` · ${DISTRICT_NAMES[user.districtCode]}` : ''}
              </p>
            </div>
            <button onClick={logout} className="btn-ghost !px-2 !py-1 !text-xs">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
