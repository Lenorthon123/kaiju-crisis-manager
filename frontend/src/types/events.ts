import type { DistrictCode, TransferMode, TransferStatus } from './api';

// The three mandatory events, plus the transfer lifecycle.
export const KaijuEvent = {
  RESOURCE_UPDATED: 'resource.updated',
  TRANSFER_CONFLICT: 'transfer.conflict',
  CATASTROPHE_LEVEL_CHANGED: 'catastrophe.level.changed',
  TRANSFER_CREATED: 'transfer.created',
  TRANSFER_UPDATED: 'transfer.updated',
  DISTRICT_SEVERITY_CHANGED: 'district.severity.changed',
  RETENTION_THRESHOLD_CHANGED: 'retention.threshold.changed',
} as const;

export interface ResourceUpdated {
  districtCode: DistrictCode;
  resourceCode: string;
  currentQuantity: number;
  reservedQuantity: number;
  committedOutbound: number;
  available: number;
  retentionMinimum: number;
  transferableSurplus: number;
  reason: 'RESERVATION' | 'RELEASE' | 'TRANSFER_COMMITTED' | 'TRANSFER_DELIVERED' | 'TRANSFER_CANCELLED';
}

export interface TransferConflict {
  districtCode: DistrictCode;
  resourceCode: string;
  requested: number;
  available: number;
  violationCode: string;
  contenders: { transferId: string; initiatorId: string }[];
  occurredAt: string;
}

export interface CatastropheLevelChanged {
  previousLevel: number;
  newLevel: number;
  name: string;
  direction: 'ESCALATION' | 'DE_ESCALATION';
  changedBy: string;
  changedAt: string;
}

export interface TransferEvent {
  transferId: string;
  sourceDistrict: DistrictCode;
  destinationDistrict: DistrictCode;
  resourceCode: string;
  quantity: number;
  mode: TransferMode;
  status: TransferStatus;
  transitDistricts: DistrictCode[];
  estimatedDeliveryAt: string | null;
}

export interface DistrictSeverityChanged {
  districtCode: DistrictCode;
  severity: number;
}

export interface RetentionThresholdChanged {
  districtCode: DistrictCode | null;
  pct: number;
  changedBy: string;
}
