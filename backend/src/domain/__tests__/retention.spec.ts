import {
  RETENTION_DEFAULT_PCT,
  RETENTION_LOWERED_PCT,
  availableQuantity,
  checkOutflow,
  checkReservation,
  retentionMinimum,
  transferableSurplus,
} from '../retention';
import { PUBLISHED_RETENTION_MINIMUMS, RESOURCES } from '../reference-data';
import { DISTRICT_CODES, StockSnapshot } from '../types';
import { ViolationCode } from '../violations';

const stock = (over: Partial<StockSnapshot> = {}): StockSnapshot => ({
  districtCode: 'A',
  resourceCode: 'MEDICAL_PERSONNEL',
  retentionBase: 12,
  currentQuantity: 12,
  reservedQuantity: 0,
  committedOutbound: 0,
  retentionPct: RETENTION_DEFAULT_PCT,
  ...over,
});

describe('retention thresholds', () => {
  it('reproduces all 50 published minimums with ceil(initial * 30%)', () => {
    for (const resource of RESOURCES) {
      for (const code of DISTRICT_CODES) {
        const initial = resource.distribution[code];
        expect({
          resource: resource.code,
          district: code,
          min: retentionMinimum(initial, RETENTION_DEFAULT_PCT),
        }).toEqual({
          resource: resource.code,
          district: code,
          min: PUBLISHED_RETENTION_MINIMUMS[resource.code][code],
        });
      }
    }
  });

  it('matches the published per-resource totals', () => {
    for (const resource of RESOURCES) {
      const sum = DISTRICT_CODES.reduce((acc, c) => acc + resource.distribution[c], 0);
      expect({ code: resource.code, sum }).toEqual({ code: resource.code, sum: resource.total });
    }
  });

  it('lowers to 15% only through the retentionPct input', () => {
    expect(retentionMinimum(12, RETENTION_LOWERED_PCT)).toBe(2);
    expect(retentionMinimum(10, RETENTION_LOWERED_PCT)).toBe(2);
    expect(retentionMinimum(2, RETENTION_LOWERED_PCT)).toBe(1);
  });

  it('derives the minimum from the FROZEN initial quantity, not the current one', () => {
    const depleted = stock({ currentQuantity: 4 });
    expect(retentionMinimum(depleted.retentionBase, depleted.retentionPct)).toBe(4);
    expect(transferableSurplus(depleted)).toBe(0);
  });

  it('cannot be drained by a sequence of transfers', () => {
    let current = 12;
    let moved = 0;
    for (let i = 0; i < 20; i += 1) {
      const s = stock({ currentQuantity: current });
      const result = checkOutflow(s, 1);
      if (!result.ok) break;
      current -= 1;
      moved += 1;
    }
    expect(moved).toBe(8);
    expect(current).toBe(4);
  });

  it('subtracts reservations and committed outbound from availability', () => {
    const s = stock({ currentQuantity: 12, reservedQuantity: 3, committedOutbound: 2 });
    expect(availableQuantity(s)).toBe(7);
    expect(transferableSurplus(s)).toBe(3);
  });

  it('distinguishes a shortage from a retention breach', () => {
    const shortage = checkOutflow(stock({ currentQuantity: 2 }), 5);
    expect(shortage.ok).toBe(false);
    if (!shortage.ok) expect(shortage.violation.code).toBe(ViolationCode.INSUFFICIENT_STOCK);

    const breach = checkOutflow(stock(), 9);
    expect(breach.ok).toBe(false);
    if (!breach.ok) {
      expect(breach.violation.code).toBe(ViolationCode.RETENTION_THRESHOLD_BREACH);
      expect(breach.violation.httpStatus).toBe(422);
      expect(breach.violation.details).toMatchObject({ minimum: 4, maxTransferable: 8 });
    }
  });

  it('rejects non positive integer quantities', () => {
    for (const q of [0, -1, 1.5]) {
      const r = checkOutflow(stock(), q);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.violation.code).toBe(ViolationCode.INVALID_QUANTITY);
    }
  });

  it('lets a local reservation dip below the retention floor', () => {
    const r = checkReservation(stock(), 12);
    expect(r.ok).toBe(true);
  });
});
