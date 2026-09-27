import {
  DistrictCode,
  StockSnapshot,
  availableQuantity,
  retentionMinimum,
  transferableSurplus,
} from '../domain';

export interface StockRow {
  id: string;
  initialQuantity: number;
  currentQuantity: number;
  reservedQuantity: number;
  committedOutbound: number;
  retentionBase: number;
  district: { id: string; code: string };
  resourceType: { id: string; code: string; name: string };
}

export function toSnapshot(row: StockRow, retentionPct: number): StockSnapshot {
  return {
    districtCode: row.district.code as DistrictCode,
    resourceCode: row.resourceType.code,
    retentionBase: row.retentionBase,
    currentQuantity: row.currentQuantity,
    reservedQuantity: row.reservedQuantity,
    committedOutbound: row.committedOutbound,
    retentionPct,
  };
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

// Everything here is derived, nothing is stored twice.
export function toView(row: StockRow, retentionPct: number): StockView {
  const snapshot = toSnapshot(row, retentionPct);
  return {
    districtCode: snapshot.districtCode,
    resourceCode: row.resourceType.code,
    resourceName: row.resourceType.name,
    initialQuantity: row.initialQuantity,
    currentQuantity: row.currentQuantity,
    reservedQuantity: row.reservedQuantity,
    committedOutbound: row.committedOutbound,
    available: availableQuantity(snapshot),
    retentionPct,
    retentionMinimum: retentionMinimum(row.retentionBase, retentionPct),
    transferableSurplus: transferableSurplus(snapshot),
  };
}
