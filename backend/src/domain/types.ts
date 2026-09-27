export type DistrictCode = 'A' | 'E' | 'W' | 'X' | 'Z';
export const SEA = 'SEA' as const;
export type SeaNode = typeof SEA;
export type NodeCode = DistrictCode | SeaNode;

export const DISTRICT_CODES: readonly DistrictCode[] = ['A', 'E', 'W', 'X', 'Z'];

export type Role = 'QC' | 'LC' | 'CD';
export type LinkType = 'LAND' | 'SEA';
export type CatastropheLevel = 1 | 2 | 3 | 4 | 5;

export type ActionKey =
  | 'VIEW_RESOURCES'
  | 'RESERVE_OWN_QUARTER'
  | 'REQUEST_ADJACENT_TRANSFER'
  | 'ORGANIZE_TRANSIT'
  | 'REQUISITION'
  | 'LOWER_RETENTION_THRESHOLD';

export type TransferMode = 'DIRECT' | 'TRANSIT' | 'MARITIME';

export interface Actor {
  id: string;
  role: Role;
  // null for LC and CD, who are not quarter-scoped
  districtCode: DistrictCode | null;
}

export interface Edge {
  from: NodeCode;
  to: NodeCode;
  type: LinkType;
}

export interface TopologyGraph {
  edges: readonly Edge[];
}

// action -> level -> allowed roles, loaded from the permission_rules table
export type PermissionMatrix = Readonly<
  Record<ActionKey, Readonly<Record<CatastropheLevel, readonly Role[]>>>
>;

export interface StockSnapshot {
  districtCode: DistrictCode;
  resourceCode: string;
  // frozen at the initial quantity — see retentionMinimum()
  retentionBase: number;
  currentQuantity: number;
  reservedQuantity: number;
  committedOutbound: number;
  // 0.30, or 0.15 once the City Director lowers it at level 5
  retentionPct: number;
}

export interface Leg {
  sequence: number;
  from: NodeCode;
  to: NodeCode;
  type: LinkType;
  // the quarter this leg departs from has to say yes
  approvalRequired: boolean;
  etaHours: number;
}

export interface Route {
  mode: TransferMode;
  legs: Leg[];
  transitDistricts: DistrictCode[];
  totalEtaHours: number;
}

export interface TimingConfig {
  baseLegHours: number;
  maritimeMultiplier: number;
}

// The annex gives no base duration, only "adds time" and "doubled".
// These are ours, and they come from the environment (docs/decisions.md, D5).
export const DEFAULT_TIMING: TimingConfig = {
  baseLegHours: 2,
  maritimeMultiplier: 2,
};
