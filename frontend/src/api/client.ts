import type {
  AuthResult,
  CatastropheView,
  CityView,
  DistrictCode,
  LevelChange,
  Reservation,
  ResourceType,
  RoutesView,
  StockView,
  Transfer,
  TransferMode,
} from '../types/api';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'kaiju.token';

// Carries the code of the rule that said no, so the UI can branch on the rule
// rather than on a bare status.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string): void => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
    }
  },
  clear: (): void => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
    }
  },
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();

  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.code ?? 'NETWORK_ERROR',
      payload?.message ?? `Request failed with status ${response.status}.`,
      payload?.details ?? null,
    );
  }

  return payload as T;
}

export const api = {
  login: (email: string, password: string) =>
    call<AuthResult>('POST', '/auth/login', { email, password }),

  register: (input: {
    email: string;
    password: string;
    displayName: string;
    role: 'QC' | 'LC' | 'CD';
    districtCode?: DistrictCode;
  }) => call<AuthResult>('POST', '/auth/register', input),

  me: () => call<AuthResult['user']>('GET', '/auth/me'),

  districts: () => call<CityView>('GET', '/districts'),
  routes: (from: DistrictCode, to: DistrictCode) =>
    call<RoutesView>('GET', `/districts/routes?from=${from}&to=${to}`),
  setSeverity: (code: DistrictCode, severity: number) =>
    call<{ code: DistrictCode; severity: number }>('PATCH', `/districts/${code}/severity`, { severity }),

  resourceTypes: () => call<ResourceType[]>('GET', '/resources'),
  stocks: (district?: DistrictCode) =>
    call<StockView[]>('GET', district ? `/stocks?district=${district}` : '/stocks'),
  availability: (resourceCode: string) =>
    call<StockView[]>('GET', `/resources/${resourceCode}/availability`),

  reservations: (district?: DistrictCode) =>
    call<Reservation[]>('GET', district ? `/reservations?district=${district}` : '/reservations'),
  createReservation: (input: {
    districtCode: DistrictCode;
    resourceCode: string;
    quantity: number;
    startAt: string;
    endAt: string;
  }) => call<Reservation>('POST', '/reservations', input),
  releaseReservation: (id: string) => call<{ released: string }>('DELETE', `/reservations/${id}`),

  transfers: (filters: { district?: DistrictCode; status?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.district) params.set('district', filters.district);
    if (filters.status) params.set('status', filters.status);
    const qs = params.toString();
    return call<Transfer[]>('GET', qs ? `/transfers?${qs}` : '/transfers');
  },
  pendingTransfers: (districtCode: DistrictCode) =>
    call<Transfer[]>('GET', `/transfers/pending/${districtCode}`),
  createTransfer: (input: {
    sourceDistrict: DistrictCode;
    destinationDistrict: DistrictCode;
    resourceCode: string;
    quantity: number;
    mode?: TransferMode;
    requisition?: boolean;
  }) => call<Transfer>('POST', '/transfers', input),
  approveTransfer: (id: string) => call<Transfer>('POST', `/transfers/${id}/approve`),
  approveLeg: (id: string, legId: string) =>
    call<Transfer>('POST', `/transfers/${id}/legs/${legId}/approve`),
  rejectTransfer: (id: string, reason?: string) =>
    call<Transfer>('POST', `/transfers/${id}/reject`, { reason }),
  deliverTransfer: (id: string) => call<Transfer>('POST', `/transfers/${id}/deliver`),

  catastrophe: () => call<CatastropheView>('GET', '/catastrophe'),
  catastropheHistory: () => call<LevelChange[]>('GET', '/catastrophe/history'),
  setCatastropheLevel: (level: number, reason?: string) =>
    call<CatastropheView>('PUT', '/catastrophe/level', { level, reason }),
  lowerRetention: (pct: number, districtCode?: DistrictCode, reason?: string) =>
    call<{ id: string; pct: string }>('POST', '/catastrophe/retention-override', {
      pct,
      districtCode,
      reason,
    }),
};
