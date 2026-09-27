import { DistrictCode, TransferMode, ViolationCode } from '../domain';

export const KaijuEvent = {
  RESOURCE_UPDATED: 'resource.updated',
  TRANSFER_CONFLICT: 'transfer.conflict',
  CATASTROPHE_LEVEL_CHANGED: 'catastrophe.level.changed',
  TRANSFER_CREATED: 'transfer.created',
  TRANSFER_UPDATED: 'transfer.updated',
  DISTRICT_SEVERITY_CHANGED: 'district.severity.changed',
  RETENTION_THRESHOLD_CHANGED: 'retention.threshold.changed',
} as const;

export type KaijuEvent = (typeof KaijuEvent)[keyof typeof KaijuEvent];

export interface ResourceUpdatedPayload {
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

export interface TransferConflictPayload {
  districtCode: DistrictCode;
  resourceCode: string;
  requested: number;
  available: number;
  violationCode: ViolationCode;
  contenders: { transferId: string; initiatorId: string }[];
  occurredAt: string;
}

export interface CatastropheLevelChangedPayload {
  previousLevel: number;
  newLevel: number;
  name: string;
  direction: 'ESCALATION' | 'DE_ESCALATION';
  changedBy: string;
  changedAt: string;
}

export interface TransferPayload {
  transferId: string;
  sourceDistrict: DistrictCode;
  destinationDistrict: DistrictCode;
  resourceCode: string;
  quantity: number;
  mode: TransferMode;
  status: string;
  transitDistricts: DistrictCode[];
  estimatedDeliveryAt: string | null;
}
