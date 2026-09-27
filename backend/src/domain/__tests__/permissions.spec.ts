import {
  REFERENCE_PERMISSION_MATRIX,
  can,
  checkPermission,
  checkScope,
  unlockLevel,
} from '../permissions';
import { ActionKey, Actor, CatastropheLevel, Role } from '../types';
import { ViolationCode } from '../violations';

const LEVELS: CatastropheLevel[] = [1, 2, 3, 4, 5];
const ROLES: Role[] = ['QC', 'LC', 'CD'];

const actor = (role: Role, districtCode: Actor['districtCode'] = null): Actor => ({
  id: `user-${role}`,
  role,
  districtCode,
});

const EXPECTED: Record<ActionKey, Record<CatastropheLevel, Role[]>> = {
  VIEW_RESOURCES: { 1: ['QC', 'LC', 'CD'], 2: ['QC', 'LC', 'CD'], 3: ['QC', 'LC', 'CD'], 4: ['QC', 'LC', 'CD'], 5: ['QC', 'LC', 'CD'] },
  RESERVE_OWN_QUARTER: { 1: [], 2: ['QC'], 3: ['QC'], 4: ['QC'], 5: ['QC'] },
  REQUEST_ADJACENT_TRANSFER: { 1: [], 2: [], 3: ['QC'], 4: ['QC', 'LC'], 5: ['QC', 'LC', 'CD'] },
  ORGANIZE_TRANSIT: { 1: [], 2: [], 3: [], 4: ['LC'], 5: ['LC', 'CD'] },
  REQUISITION: { 1: [], 2: [], 3: [], 4: ['CD'], 5: ['CD'] },
  LOWER_RETENTION_THRESHOLD: { 1: [], 2: [], 3: [], 4: [], 5: ['CD'] },
};

describe('permission matrix', () => {
  it('matches the annex for all 90 (action, level, role) combinations', () => {
    for (const action of Object.keys(EXPECTED) as ActionKey[]) {
      for (const level of LEVELS) {
        for (const role of ROLES) {
          expect({ action, level, role, allowed: can(REFERENCE_PERMISSION_MATRIX, role, action, level) }).toEqual({
            action,
            level,
            role,
            allowed: EXPECTED[action][level].includes(role),
          });
        }
      }
    }
  });

  it('permits nothing but viewing at level 1', () => {
    for (const action of Object.keys(EXPECTED) as ActionKey[]) {
      for (const role of ROLES) {
        const allowed = can(REFERENCE_PERMISSION_MATRIX, role, action, 1);
        expect(allowed).toBe(action === 'VIEW_RESOURCES');
      }
    }
  });

  it('keeps reservation a QC-only action, City Director included', () => {
    expect(can(REFERENCE_PERMISSION_MATRIX, 'CD', 'RESERVE_OWN_QUARTER', 5)).toBe(false);
    expect(can(REFERENCE_PERMISSION_MATRIX, 'LC', 'RESERVE_OWN_QUARTER', 5)).toBe(false);
  });

  it('never lets a QC organise a transit chain', () => {
    for (const level of LEVELS) {
      expect(can(REFERENCE_PERMISSION_MATRIX, 'QC', 'ORGANIZE_TRANSIT', level)).toBe(false);
    }
  });

  it('keeps the Logistics Coordinator idle until level 4', () => {
    expect(unlockLevel(REFERENCE_PERMISSION_MATRIX, 'LC', 'REQUEST_ADJACENT_TRANSFER')).toBe(4);
    expect(unlockLevel(REFERENCE_PERMISSION_MATRIX, 'LC', 'ORGANIZE_TRANSIT')).toBe(4);
  });

  it('returns a distinct, explanatory violation', () => {
    const r = checkPermission(REFERENCE_PERMISSION_MATRIX, actor('LC'), 'REQUEST_ADJACENT_TRANSFER', 3);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violation.code).toBe(ViolationCode.ROLE_NOT_PERMITTED_AT_LEVEL);
      expect(r.violation.httpStatus).toBe(403);
      expect(r.violation.details).toMatchObject({ allowedRoles: ['QC'] });
    }
  });
});

describe('scope', () => {
  it('confines a QC to its own quarter', () => {
    const ok = checkScope(actor('QC', 'A'), 'A');
    expect(ok.ok).toBe(true);

    const ko = checkScope(actor('QC', 'A'), 'Z');
    expect(ko.ok).toBe(false);
    if (!ko.ok) expect(ko.violation.code).toBe(ViolationCode.OUT_OF_SCOPE_QUARTER);
  });

  it('does not constrain LC and CD', () => {
    expect(checkScope(actor('LC'), 'Z').ok).toBe(true);
    expect(checkScope(actor('CD'), 'Z').ok).toBe(true);
  });

  it('rejects a QC account with no quarter attached', () => {
    const r = checkScope(actor('QC', null), 'A');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe(ViolationCode.QC_WITHOUT_QUARTER);
  });
});
