import { REFERENCE_GRAPH } from '../topology';
import { REFERENCE_PERMISSION_MATRIX } from '../permissions';
import { RETENTION_DEFAULT_PCT, RETENTION_LOWERED_PCT } from '../retention';
import {
  evaluateReservation,
  evaluateRetentionOverride,
  evaluateTransfer,
  TransferRequest,
} from '../transfer-rules';
import { Actor, CatastropheLevel, DistrictCode, StockSnapshot } from '../types';
import { ViolationCode } from '../violations';

const actor = (role: Actor['role'], districtCode: DistrictCode | null = null): Actor => ({
  id: `user-${role}`,
  role,
  districtCode,
});

const stock = (
  districtCode: DistrictCode,
  over: Partial<StockSnapshot> = {},
): StockSnapshot => ({
  districtCode,
  resourceCode: 'MEDICAL_PERSONNEL',
  retentionBase: 12,
  currentQuantity: 12,
  reservedQuantity: 0,
  committedOutbound: 0,
  retentionPct: RETENTION_DEFAULT_PCT,
  ...over,
});

const request = (over: Partial<TransferRequest> = {}): TransferRequest => ({
  actor: actor('QC', 'X'),
  level: 3,
  source: 'A',
  destination: 'X',
  quantity: 2,
  sourceStock: stock('A'),
  adjacentToDestinationStocks: [],
  ...over,
});

const evaluate = (over: Partial<TransferRequest> = {}) =>
  evaluateTransfer(REFERENCE_GRAPH, REFERENCE_PERMISSION_MATRIX, request(over));

const codeOf = (r: ReturnType<typeof evaluate>) => (r.ok ? null : r.violation.code);

describe('transfer evaluation', () => {
  it('accepts an adjacent transfer at level 3 requested by the receiving QC', () => {
    const r = evaluate();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.route.mode).toBe('DIRECT');
      expect(r.value.requiredAction).toBe('REQUEST_ADJACENT_TRANSFER');
      expect(r.value.transitDistricts).toEqual([]);
    }
  });

  describe('catastrophe level gating', () => {
    it.each([1, 2] as CatastropheLevel[])(
      'forbids every inter-quarter transfer at level %i',
      (level) => {
        expect(codeOf(evaluate({ level }))).toBe(ViolationCode.INTER_QUARTER_TRANSFER_FORBIDDEN);
      },
    );

    it('forbids a transit chain at level 3', () => {
      const r = evaluate({
        actor: actor('LC'),
        level: 3,
        source: 'A',
        destination: 'Z',
      });
      expect(codeOf(r)).toBe(ViolationCode.TRANSIT_FORBIDDEN_AT_LEVEL);
    });

    it('unlocks the transit chain for the LC at level 4', () => {
      const r = evaluate({
        actor: actor('LC'),
        level: 4,
        source: 'A',
        destination: 'Z',
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.route.mode).toBe('TRANSIT');
        expect(r.value.transitDistricts).toEqual(['W']);
        expect(r.value.requiredAction).toBe('ORGANIZE_TRANSIT');
      }
    });

    it('still refuses a transit chain to a QC at level 4', () => {
      const r = evaluate({
        actor: actor('QC', 'Z'),
        level: 4,
        source: 'A',
        destination: 'Z',
      });
      expect(codeOf(r)).toBe(ViolationCode.ROLE_NOT_PERMITTED_AT_LEVEL);
    });
  });

  describe('scope', () => {
    it('refuses a QC pulling resources towards another quarter', () => {
      const r = evaluate({ actor: actor('QC', 'E'), source: 'A', destination: 'X' });
      expect(codeOf(r)).toBe(ViolationCode.OUT_OF_SCOPE_QUARTER);
    });
  });

  describe('topology', () => {
    it('refuses a forced direct transfer between non-adjacent quarters', () => {
      const r = evaluate({
        actor: actor('LC'),
        level: 4,
        source: 'A',
        destination: 'Z',
        preferredMode: 'DIRECT',
      });
      expect(codeOf(r)).toBe(ViolationCode.NOT_ADJACENT);
    });

    it('refuses a maritime route from a landlocked quarter', () => {
      const r = evaluate({
        actor: actor('LC'),
        level: 4,
        source: 'A',
        destination: 'Z',
        preferredMode: 'MARITIME',
      });
      expect(codeOf(r)).toBe(ViolationCode.MARITIME_ROUTE_UNAVAILABLE);
    });

    it('prioritises the maritime route at level 5 for E -> Z', () => {
      const r = evaluate({
        actor: actor('CD'),
        level: 5,
        source: 'E',
        destination: 'Z',
        sourceStock: stock('E', { retentionBase: 8, currentQuantity: 8 }),
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.route.mode).toBe('MARITIME');
    });

    it('prefers the faster land transit at level 4 for E -> Z', () => {
      const r = evaluate({
        actor: actor('LC'),
        level: 4,
        source: 'E',
        destination: 'Z',
        sourceStock: stock('E', { retentionBase: 8, currentQuantity: 8 }),
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.route.mode).toBe('TRANSIT');
    });
  });

  describe('adjacency priority (annex rule #2)', () => {
    it('refuses a distant supplier when a neighbour of the destination has the surplus', () => {
      const r = evaluate({
        actor: actor('LC'),
        level: 4,
        source: 'A',
        destination: 'Z',
        quantity: 3,
        adjacentToDestinationStocks: [
          stock('W', { retentionBase: 8, currentQuantity: 8 }), // surplus 5
        ],
      });
      expect(codeOf(r)).toBe(ViolationCode.ADJACENT_SOURCE_AVAILABLE);
    });

    it('allows the distant supplier once no neighbour can cover the request', () => {
      const r = evaluate({
        actor: actor('LC'),
        level: 4,
        source: 'A',
        destination: 'Z',
        quantity: 3,
        adjacentToDestinationStocks: [
          stock('W', { retentionBase: 8, currentQuantity: 3 }), // surplus 0
          stock('X', { retentionBase: 3, currentQuantity: 3 }), // surplus 2
        ],
      });
      expect(r.ok).toBe(true);
    });

    it('names the neighbour with the largest surplus, deterministically', () => {
      const candidates = [
        stock('X', { retentionBase: 6, currentQuantity: 6 }), // surplus 4
        stock('W', { retentionBase: 3, currentQuantity: 10 }), // surplus 9
      ];
      const run = (order: typeof candidates) =>
        evaluate({
          actor: actor('LC'),
          level: 4,
          source: 'E',
          destination: 'Z',
          quantity: 2,
          sourceStock: stock('E', { retentionBase: 9, currentQuantity: 9 }),
          adjacentToDestinationStocks: order,
        });

      for (const order of [candidates, [...candidates].reverse()]) {
        const r = run(order);
        expect(codeOf(r)).toBe(ViolationCode.ADJACENT_SOURCE_AVAILABLE);
        if (!r.ok) {
          expect(r.violation.details).toMatchObject({
            adjacentCandidate: 'W',
            adjacentSurplus: 9,
          });
        }
      }
    });

    it('does not apply the rule to adjacent suppliers', () => {
      const r = evaluate({
        quantity: 2,
        adjacentToDestinationStocks: [stock('E', { retentionBase: 9, currentQuantity: 9 })],
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('retention', () => {
    it('refuses the transfer that would breach the source threshold', () => {
      const r = evaluate({ quantity: 9 });
      expect(codeOf(r)).toBe(ViolationCode.RETENTION_THRESHOLD_BREACH);
    });

    it('accepts exactly the surplus', () => {
      const r = evaluate({ quantity: 8 });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.remainingSurplus).toBe(0);
    });

    it('checks the permission before revealing any stock figure', () => {
      const r = evaluate({ actor: actor('LC'), level: 3, quantity: 999 });
      expect(codeOf(r)).toBe(ViolationCode.ROLE_NOT_PERMITTED_AT_LEVEL);
    });
  });

  describe('requisition', () => {
    it('is reserved to the City Director from level 4', () => {
      const denied = evaluate({ actor: actor('LC'), level: 4, isRequisition: true });
      expect(codeOf(denied)).toBe(ViolationCode.ROLE_NOT_PERMITTED_AT_LEVEL);

      const granted = evaluate({ actor: actor('CD'), level: 4, isRequisition: true });
      expect(granted.ok).toBe(true);
    });

    it('does not bypass the retention threshold', () => {
      const r = evaluate({ actor: actor('CD'), level: 4, isRequisition: true, quantity: 9 });
      expect(codeOf(r)).toBe(ViolationCode.RETENTION_THRESHOLD_BREACH);
    });

    it('does not bypass geography', () => {
      const r = evaluate({
        actor: actor('CD'),
        level: 4,
        isRequisition: true,
        source: 'A',
        destination: 'Z',
        preferredMode: 'MARITIME',
      });
      expect(codeOf(r)).toBe(ViolationCode.MARITIME_ROUTE_UNAVAILABLE);
    });
  });
});

describe('reservation evaluation', () => {
  it('is impossible at level 1', () => {
    const r = evaluateReservation(REFERENCE_PERMISSION_MATRIX, {
      actor: actor('QC', 'A'),
      level: 1,
      district: 'A',
      quantity: 1,
      stock: stock('A'),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe(ViolationCode.NO_RESERVATION_AT_LEVEL_1);
  });

  it('is allowed for a QC in its own quarter from level 2', () => {
    const r = evaluateReservation(REFERENCE_PERMISSION_MATRIX, {
      actor: actor('QC', 'A'),
      level: 2,
      district: 'A',
      quantity: 3,
      stock: stock('A'),
    });
    expect(r.ok).toBe(true);
  });

  it('is refused in another quarter', () => {
    const r = evaluateReservation(REFERENCE_PERMISSION_MATRIX, {
      actor: actor('QC', 'A'),
      level: 2,
      district: 'E',
      quantity: 1,
      stock: stock('E'),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe(ViolationCode.OUT_OF_SCOPE_QUARTER);
  });
});

describe('retention override', () => {
  const call = (role: Actor['role'], level: CatastropheLevel, pct = RETENTION_LOWERED_PCT) =>
    evaluateRetentionOverride(
      REFERENCE_PERMISSION_MATRIX,
      actor(role),
      level,
      pct,
      RETENTION_LOWERED_PCT,
    );

  it('needs level 5', () => {
    const r = call('CD', 4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe(ViolationCode.RETENTION_OVERRIDE_REQUIRES_LEVEL_5);
  });

  it('needs the City Director', () => {
    const r = call('LC', 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe(ViolationCode.RETENTION_OVERRIDE_REQUIRES_CD);
  });

  it('only accepts the published 15% value', () => {
    const r = call('CD', 5, 0.05);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe(ViolationCode.RETENTION_PCT_NOT_ALLOWED);
    expect(call('CD', 5).ok).toBe(true);
  });
});
