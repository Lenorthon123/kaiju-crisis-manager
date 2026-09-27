import type { CatastropheLevel, TransferStatus } from '../types/api';

export const LEVEL_NAMES: Record<number, string> = {
  1: 'Watch',
  2: 'Alert',
  3: 'Emergency',
  4: 'Critical',
  5: 'Catastrophic',
};

export const SEVERITY_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#84cc16',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
};

export const DISTRICT_NAMES: Record<string, string> = {
  A: 'Apex',
  E: 'Echo',
  W: 'Warden',
  X: 'Xeno',
  Z: 'Zion',
};

export const ROLE_NAMES: Record<string, string> = {
  QC: 'Quarter Coordinator',
  LC: 'Logistics Coordinator',
  CD: 'City Director',
};

export const STATUS_LABELS: Record<TransferStatus, string> = {
  PENDING_SOURCE_APPROVAL: 'Source approval',
  PENDING_TRANSIT_APPROVAL: 'Transit approval',
  APPROVED: 'Approved',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const STATUS_TONES: Record<TransferStatus, string> = {
  PENDING_SOURCE_APPROVAL: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  PENDING_TRANSIT_APPROVAL: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  APPROVED: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  IN_TRANSIT: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  DELIVERED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  CANCELLED: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

export const humanResource = (code: string): string =>
  code
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

export const formatDateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const formatShort = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export const levelName = (level: CatastropheLevel | number): string =>
  LEVEL_NAMES[level] ?? `Level ${level}`;
