import { useState, type FormEvent } from 'react';
import { ApiError, api, tokenStore } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { ErrorNotice, Field } from '../components/ui';
import { DISTRICT_NAMES, ROLE_NAMES } from '../lib/format';
import type { DistrictCode, Role } from '../types/api';

const DEMO = [
  { label: 'QC Apex', email: 'qc.apex@tokyork.gov' },
  { label: 'QC Xeno', email: 'qc.xeno@tokyork.gov' },
  { label: 'Logistics Coordinator', email: 'lc@tokyork.gov' },
  { label: 'City Director', email: 'cd@tokyork.gov' },
];

const CODES: DistrictCode[] = ['A', 'E', 'W', 'X', 'Z'];
const ROLES: Role[] = ['QC', 'LC', 'CD'];

const asApiError = (e: unknown) =>
  e instanceof ApiError ? e : new ApiError(0, 'NETWORK_ERROR', 'Server unreachable.');

export function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-1 text-center">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-slate-100">KAIJU_</h1>
          <p className="text-sm text-slate-400">Tokyork Crisis Manager</p>
        </header>

        <div className="flex rounded-md border border-white/10 p-1 text-sm">
          {(['signin', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded px-3 py-1.5 transition ${
                mode === m ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        {mode === 'signin' ? (
          <SignInForm email={email} onEmailChange={setEmail} />
        ) : (
          <RegisterForm email={email} onEmailChange={setEmail} />
        )}

        {mode === 'signin' && (
          <div className="card space-y-2">
            <p className="label">Demo accounts</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => setEmail(d.email)}
                  className="btn-ghost !justify-start !px-2 !py-1.5 !text-xs"
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Shared password, set by <code className="font-mono">SEED_PASSWORD</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SignInForm({
  email,
  onEmailChange,
}: {
  email: string;
  onEmailChange: (value: string) => void;
}) {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4">
      <Field label="Email">
        <input
          className="input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          required
        />
      </Field>

      <Field label="Password">
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>

      <ErrorNotice error={error} />

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

// The quarter field shows only for a QC, because the server rejects a QC
// without one and an LC or CD with one. Mirroring the rule here means the
// officer never meets it as a refusal — the server still enforces it.
function RegisterForm({
  email,
  onEmailChange,
}: {
  email: string;
  onEmailChange: (value: string) => void;
}) {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('QC');
  const [districtCode, setDistrictCode] = useState<DistrictCode>('A');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.register({
        email,
        password,
        displayName,
        role,
        ...(role === 'QC' ? { districtCode } : {}),
      });
      await login(email, password);
    } catch (err) {
      setError(asApiError(err));
      tokenStore.clear();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4">
      <Field label="Full name">
        <input
          className="input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          minLength={2}
          required
        />
      </Field>

      <Field label="Email">
        <input
          className="input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          required
        />
      </Field>

      <Field label="Password">
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={10}
          required
        />
        <span className="text-[11px] text-slate-500">At least 10 characters.</span>
      </Field>

      <Field label="Role">
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r} — {ROLE_NAMES[r]}
            </option>
          ))}
        </select>
      </Field>

      {role === 'QC' && (
        <Field label="Quarter">
          <select
            className="input"
            value={districtCode}
            onChange={(e) => setDistrictCode(e.target.value as DistrictCode)}
          >
            {CODES.map((c) => (
              <option key={c} value={c}>
                {c} — {DISTRICT_NAMES[c]}
              </option>
            ))}
          </select>
        </Field>
      )}

      <ErrorNotice error={error} />

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
