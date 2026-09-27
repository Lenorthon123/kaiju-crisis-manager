import {
  ActionKey,
  Actor,
  CatastropheLevel,
  DistrictCode,
  PermissionMatrix,
  Role,
} from './types';
import { RuleResult, ViolationCode, fail, ok, violation } from './violations';

// Copied from the annex matrix.
// The role sheet calls the City Director "full authority", but the matrix gives
// RESERVE_OWN_QUARTER to QC only. The subject says permissions are enforced
// exactly as specified, so the matrix wins. See docs/decisions.md (D7).
// At runtime this lives in the permission_rules table — data, not ifs.
export const REFERENCE_PERMISSION_MATRIX: PermissionMatrix = {
  VIEW_RESOURCES: {
    1: ['QC', 'LC', 'CD'],
    2: ['QC', 'LC', 'CD'],
    3: ['QC', 'LC', 'CD'],
    4: ['QC', 'LC', 'CD'],
    5: ['QC', 'LC', 'CD'],
  },
  RESERVE_OWN_QUARTER: {
    1: [],
    2: ['QC'],
    3: ['QC'],
    4: ['QC'],
    5: ['QC'],
  },
  REQUEST_ADJACENT_TRANSFER: {
    1: [],
    2: [],
    3: ['QC'],
    4: ['QC', 'LC'],
    5: ['QC', 'LC', 'CD'],
  },
  ORGANIZE_TRANSIT: {
    1: [],
    2: [],
    3: [],
    4: ['LC'],
    5: ['LC', 'CD'],
  },
  REQUISITION: {
    1: [],
    2: [],
    3: [],
    4: ['CD'],
    5: ['CD'],
  },
  LOWER_RETENTION_THRESHOLD: {
    1: [],
    2: [],
    3: [],
    4: [],
    5: ['CD'],
  },
};

function rolesFor(
  matrix: PermissionMatrix,
  action: ActionKey,
  level: CatastropheLevel,
): readonly Role[] {
  return matrix[action]?.[level] ?? [];
}

export function can(
  matrix: PermissionMatrix,
  role: Role,
  action: ActionKey,
  level: CatastropheLevel,
): boolean {
  return rolesFor(matrix, action, level).includes(role);
}

export function checkPermission(
  matrix: PermissionMatrix,
  actor: Actor,
  action: ActionKey,
  level: CatastropheLevel,
): RuleResult<true> {
  if (can(matrix, actor.role, action, level)) return ok(true);

  const allowed = rolesFor(matrix, action, level);
  return fail(
    violation(
      ViolationCode.ROLE_NOT_PERMITTED_AT_LEVEL,
      allowed.length === 0
        ? `Action ${action} is not permitted at catastrophe level ${level} for any role.`
        : `Role ${actor.role} cannot perform ${action} at catastrophe level ${level}. Allowed: ${allowed.join(', ')}.`,
      { action, level, role: actor.role, allowedRoles: allowed },
    ),
  );
}

export function checkScope(
  actor: Actor,
  targetDistrict: DistrictCode,
): RuleResult<true> {
  if (actor.role !== 'QC') return ok(true);

  if (!actor.districtCode) {
    return fail(
      violation(
        ViolationCode.QC_WITHOUT_QUARTER,
        'Quarter Coordinator account is not attached to any quarter.',
        { userId: actor.id },
      ),
    );
  }

  if (actor.districtCode !== targetDistrict) {
    return fail(
      violation(
        ViolationCode.OUT_OF_SCOPE_QUARTER,
        `Quarter Coordinator of ${actor.districtCode} cannot act on quarter ${targetDistrict}.`,
        { actorDistrict: actor.districtCode, targetDistrict },
      ),
    );
  }

  return ok(true);
}

export function unlockLevel(
  matrix: PermissionMatrix,
  role: Role,
  action: ActionKey,
): CatastropheLevel | null {
  for (const level of [1, 2, 3, 4, 5] as CatastropheLevel[]) {
    if (can(matrix, role, action, level)) return level;
  }
  return null;
}
