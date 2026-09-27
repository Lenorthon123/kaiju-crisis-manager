// The API contract, mirrored by hand from the backend.
// Deliberately one file: if a field name turns out wrong, it is fixed here and
// the compiler points at every call site.
export type DistrictCode = 'A' | 'E' | 'W' | 'X' | 'Z';
export type Role = 'QC' | 'LC' | 'CD';
export type CatastropheLevel = 1 | 2 | 3 | 4 | 5;
export type TransferMode = 'DIRECT' | 'TRANSIT' | 'MARITIME';
export type LinkType = 'LAND' | 'SEA';

export type ActionKey =
  | 'VIEW_RESOURCES'
  | 'RESERVE_OWN_QUARTER'
  | 'REQUEST_ADJACENT_TRANSFER'
  | 'ORGANIZE_TRANSIT'
  | 'REQUISITION'
  | 'LOWER_RETENTION_THRESHOLD';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  districtId: string | null;
  districtCode: DistrictCode | null;
}

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

export interface DistrictView {
  code: DistrictCode;
  name: string;
  severity: number;
  hasSeaAccess: boolean;
  isHub: boolean;
  adjacentTo: DistrictCode[];
}

export interface Edge {
  from: string;
  to: string;
  type: LinkType;
}

export interface CityView {
  districts: DistrictView[];
  edges: Edge[];
}

export interface ResourceType {
  id: string;
  code: string;
  name: string;
  unit: string;
  order: number;
}

export interface StockView {
  districtCode: DistrictCode;
  resourceCode: string;
  resourceName: string;
  initialQuantity: number;
  currentQuantity: number;
  reservedQuantity: number;
  committedOutbound: number;
  available: number;
  retentionPct: number;
  retentionMinimum: number;
  transferableSurplus: number;
}

export interface Reservation {
  id: string;
  quantity: number;
  startAt: string;
  endAt: string;
  status: 'ACTIVE' | 'RELEASED' | 'CANCELLED';
  district: { code: DistrictCode };
  resourceType: { code: string; name: string };
  requester?: { id: string; displayName: string; role: Role };
}

export interface TransferLeg {
  id: string;
  sequence: number;
  fromNode: string;
  toNode: string;
  linkType: LinkType;
  approvalRequired: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_TRANSIT' | 'DELIVERED';
  approvedById: string | null;
  etaHours: number;
}

export type TransferStatus =
  | 'PENDING_SOURCE_APPROVAL'
  | 'PENDING_TRANSIT_APPROVAL'
  | 'APPROVED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';

export interface Transfer {
  id: string;
  quantity: number;
  mode: TransferMode;
  status: TransferStatus;
  isRequisition: boolean;
  priority: number;
  etaHours: number;
  requestedAt: string;
  departureAt: string | null;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  rejectionReason: string | null;
  source: { id: string; code: DistrictCode };
  destination: { id: string; code: DistrictCode };
  resourceType: { id: string; code: string; name: string };
  initiator: { id: string; displayName: string; role: Role };
  legs: TransferLeg[];
}

export interface Route {
  mode: TransferMode;
  legs: { sequence: number; from: string; to: string; type: LinkType; approvalRequired: boolean; etaHours: number }[];
  transitDistricts: DistrictCode[];
  totalEtaHours: number;
}

export interface RoutesView {
  from: DistrictCode;
  to: DistrictCode;
  adjacent: boolean;
  seaAccess: { from: boolean; to: boolean };
  routes: Route[];
}

export interface CatastropheView {
  level: CatastropheLevel;
  name: string;
  description: string;
  levels: { level: number; name: string; description: string }[];
  permissions: Record<
    'reserveOwnQuarter' | 'requestAdjacentTransfer' | 'organizeTransit' | 'requisition' | 'lowerRetentionThreshold',
    CatastropheLevel | null
  >;
}

export interface LevelChange {
  id: string;
  previousLevel: number;
  newLevel: number;
  reason: string | null;
  changedAt: string;
  changedBy: { displayName: string; role: Role };
}
