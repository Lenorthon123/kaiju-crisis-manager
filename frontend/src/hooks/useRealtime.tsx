import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { connectSocket, type Socket } from '../api/socket';
import { useAuth } from './useAuth';
import type {
  CatastropheLevelChanged,
  DistrictSeverityChanged,
  ResourceUpdated,
  RetentionThresholdChanged,
  TransferConflict,
  TransferEvent,
} from '../types/events';
import { KaijuEvent } from '../types/events';

export interface Alert {
  id: string;
  kind: 'LEVEL' | 'CONFLICT' | 'TRANSFER' | 'RETENTION';
  title: string;
  body: string;
  at: string;
  severity: 'info' | 'warning' | 'danger';
}

interface RealtimeState {
  connected: boolean;
  alerts: Alert[];
  dismissAlert: (id: string) => void;
  on<T>(event: string, handler: (payload: T) => void): () => void;
}

const RealtimeContext = createContext<RealtimeState | null>(null);

let alertSeq = 0;
const nextId = () => `alert-${Date.now()}-${alertSeq++}`;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socket = connectSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    const push = (alert: Omit<Alert, 'id'>) =>
      setAlerts((current) => [{ ...alert, id: nextId() }, ...current].slice(0, 20));

    socket.on(KaijuEvent.CATASTROPHE_LEVEL_CHANGED, (p: CatastropheLevelChanged) =>
      push({
        kind: 'LEVEL',
        title:
          p.direction === 'ESCALATION'
            ? `Escalation — level ${p.newLevel} (${p.name})`
            : `De-escalation — level ${p.newLevel} (${p.name})`,
        body: `Changed by ${p.changedBy}, from level ${p.previousLevel}.`,
        at: p.changedAt,
        severity: p.direction === 'ESCALATION' ? 'danger' : 'info',
      }),
    );

    socket.on(KaijuEvent.TRANSFER_CONFLICT, (p: TransferConflict) =>
      push({
        kind: 'CONFLICT',
        title: `Conflict on ${p.resourceCode} in ${p.districtCode}`,
        body: `${p.requested} requested, ${p.available} available (${p.violationCode}). ${p.contenders.length} competing request(s).`,
        at: p.occurredAt,
        severity: 'warning',
      }),
    );

    socket.on(KaijuEvent.RETENTION_THRESHOLD_CHANGED, (p: RetentionThresholdChanged) =>
      push({
        kind: 'RETENTION',
        title: `Retention threshold lowered to ${Math.round(p.pct * 100)}%`,
        body: `${p.districtCode ? `Quarter ${p.districtCode}` : 'City-wide'} — authorised by ${p.changedBy}.`,
        at: new Date().toISOString(),
        severity: 'warning',
      }),
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const value = useMemo<RealtimeState>(
    () => ({
      connected,
      alerts,
      dismissAlert: (id) => setAlerts((current) => current.filter((a) => a.id !== id)),
      on<T>(event: string, handler: (payload: T) => void) {
        const socket = socketRef.current;
        if (!socket) return () => undefined;
        socket.on(event, handler as (...args: unknown[]) => void);
        return () => {
          socket.off(event, handler as (...args: unknown[]) => void);
        };
      },
    }),
    [connected, alerts],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeState {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return ctx;
}

export function useRealtimeEvent<T>(event: string, handler: (payload: T) => void): void {
  const { on } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => on<T>(event, (payload) => ref.current(payload)), [event, on]);
}

export type {
  CatastropheLevelChanged,
  DistrictSeverityChanged,
  ResourceUpdated,
  TransferEvent,
};
