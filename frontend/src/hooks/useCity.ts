import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAsync } from './useAsync';
import { useRealtimeEvent } from './useRealtime';
import { KaijuEvent, type DistrictSeverityChanged } from '../types/events';
import type { DistrictCode, DistrictView, Edge } from '../types/api';

export interface CityState {
  districts: DistrictView[];
  edges: Edge[];
  loading: boolean;
  reload: () => void;
  applySeverity: (code: DistrictCode, severity: number) => void;
  adjacentTo: (code: DistrictCode) => DistrictCode[];
}

// Severity drives the colour of the map, so it must never be stale. The event
// carries the new value, so we patch in place instead of refetching the city.
// Patches are dropped as soon as a fresh fetch confirms them.
export function useCity(): CityState {
  const { data, loading, reload } = useAsync(() => api.districts(), []);
  const [patched, setPatched] = useState<Partial<Record<DistrictCode, number>>>({});

  useEffect(() => {
    if (data) setPatched({});
  }, [data]);

  useRealtimeEvent<DistrictSeverityChanged>(KaijuEvent.DISTRICT_SEVERITY_CHANGED, (event) => {
    setPatched((current) => ({ ...current, [event.districtCode]: event.severity }));
  });

  const applySeverity = useCallback((code: DistrictCode, severity: number) => {
    setPatched((current) => ({ ...current, [code]: severity }));
  }, []);

  const districts = useMemo(
    () =>
      (data?.districts ?? []).map((district) => {
        const override = patched[district.code];
        return override === undefined ? district : { ...district, severity: override };
      }),
    [data, patched],
  );

  const adjacentTo = useCallback(
    (code: DistrictCode) => districts.find((d) => d.code === code)?.adjacentTo ?? [],
    [districts],
  );

  return { districts, edges: data?.edges ?? [], loading, reload, applySeverity, adjacentTo };
}
