import type { ReactNode } from 'react';
import { ApiError } from '../api/client';

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-slate-200">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${
        tone || 'border-white/10 bg-white/5 text-slate-300'
      }`}
    >
      {children}
    </span>
  );
}

export function ErrorNotice({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-rose-200">{error.message}</span>
        <code className="shrink-0 rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-[11px] text-rose-200">
          {error.code}
        </code>
      </div>
      {error.details != null && (
        <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 font-mono text-[11px] text-rose-100/80">
          {JSON.stringify(error.details, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <p className="py-6 text-center text-sm text-slate-500">{label}</p>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
