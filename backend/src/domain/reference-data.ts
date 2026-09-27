import { DistrictCode } from './types';

export interface DistrictSeed {
  code: DistrictCode;
  name: string;
  hasSeaAccess: boolean;
  isHub: boolean;
}

export const DISTRICTS: readonly DistrictSeed[] = [
  { code: 'A', name: 'Apex', hasSeaAccess: false, isHub: false },
  { code: 'E', name: 'Echo', hasSeaAccess: true, isHub: false },
  { code: 'W', name: 'Warden', hasSeaAccess: false, isHub: false },
  { code: 'X', name: 'Xeno', hasSeaAccess: true, isHub: true },
  { code: 'Z', name: 'Zion', hasSeaAccess: true, isHub: false },
];

export interface ResourceSeed {
  code: string;
  name: string;
  order: number;
  distribution: Record<DistrictCode, number>;
  total: number;
}

export const RESOURCES: readonly ResourceSeed[] = [
  { code: 'MEDICAL_PERSONNEL', name: 'Medical personnel', order: 1, distribution: { A: 12, E: 5, W: 8, X: 3, Z: 7 }, total: 35 },
  { code: 'RESCUE_TEAMS', name: 'Rescue teams', order: 2, distribution: { A: 4, E: 9, W: 3, X: 6, Z: 5 }, total: 27 },
  { code: 'TRANSPORT_VEHICLES', name: 'Transport vehicles', order: 3, distribution: { A: 6, E: 3, W: 10, X: 4, Z: 7 }, total: 30 },
  { code: 'EMERGENCY_SHELTERS', name: 'Emergency shelters', order: 4, distribution: { A: 8, E: 6, W: 4, X: 10, Z: 2 }, total: 30 },
  { code: 'FOOD_WATER_SUPPLIES', name: 'Food & water supplies', order: 5, distribution: { A: 5, E: 8, W: 6, X: 7, Z: 9 }, total: 35 },
  { code: 'COMMUNICATION_EQUIPMENT', name: 'Communication equipment', order: 6, distribution: { A: 3, E: 7, W: 5, X: 8, Z: 4 }, total: 27 },
  { code: 'POWER_GENERATORS', name: 'Power generators', order: 7, distribution: { A: 7, E: 2, W: 9, X: 5, Z: 6 }, total: 29 },
  { code: 'ENGINEERING_CREWS', name: 'Engineering crews', order: 8, distribution: { A: 2, E: 6, W: 7, X: 4, Z: 8 }, total: 27 },
  { code: 'SECURITY_UNITS', name: 'Security units', order: 9, distribution: { A: 9, E: 4, W: 2, X: 6, Z: 3 }, total: 24 },
  { code: 'HAZMAT_EQUIPMENT', name: 'Hazmat equipment', order: 10, distribution: { A: 3, E: 5, W: 4, X: 2, Z: 10 }, total: 24 },
];

// The engine never reads this. It exists so a test can prove that
// ceil(initial * 0.30) reproduces all 50 published values.
export const PUBLISHED_RETENTION_MINIMUMS: Record<string, Record<DistrictCode, number>> = {
  MEDICAL_PERSONNEL: { A: 4, E: 2, W: 3, X: 1, Z: 3 },
  RESCUE_TEAMS: { A: 2, E: 3, W: 1, X: 2, Z: 2 },
  TRANSPORT_VEHICLES: { A: 2, E: 1, W: 3, X: 2, Z: 3 },
  EMERGENCY_SHELTERS: { A: 3, E: 2, W: 2, X: 3, Z: 1 },
  FOOD_WATER_SUPPLIES: { A: 2, E: 3, W: 2, X: 3, Z: 3 },
  COMMUNICATION_EQUIPMENT: { A: 1, E: 3, W: 2, X: 3, Z: 2 },
  POWER_GENERATORS: { A: 3, E: 1, W: 3, X: 2, Z: 2 },
  ENGINEERING_CREWS: { A: 1, E: 2, W: 3, X: 2, Z: 3 },
  SECURITY_UNITS: { A: 3, E: 2, W: 1, X: 2, Z: 1 },
  HAZMAT_EQUIPMENT: { A: 1, E: 2, W: 2, X: 1, Z: 3 },
};

export const PUBLISHED_ADJACENCY: Record<
  DistrictCode,
  Record<DistrictCode | 'SEA', boolean | null>
> = {
  A: { A: null, E: true, W: true, X: true, Z: false, SEA: false },
  E: { A: true, E: null, W: false, X: true, Z: false, SEA: true },
  W: { A: true, E: false, W: null, X: true, Z: true, SEA: false },
  X: { A: true, E: true, W: true, X: null, Z: true, SEA: true },
  Z: { A: false, E: false, W: true, X: true, Z: null, SEA: true },
};

export const CATASTROPHE_LEVELS = [
  { level: 1, name: 'Watch', description: 'Monitoring phase. No reservation allowed. Resources stay in place.' },
  { level: 2, name: 'Alert', description: 'Reservations within own quarter only. No inter-quarter transfers.' },
  { level: 3, name: 'Emergency', description: 'Transfers between adjacent quarters authorized. QC approval required.' },
  { level: 4, name: 'Critical', description: 'Extended transfers (adjacent + transit). LC can initiate transfer chains. CD can requisition.' },
  { level: 5, name: 'Catastrophic', description: 'All transfers unlocked. CD can reduce retention threshold to 15%. Maritime route prioritized.' },
] as const;
