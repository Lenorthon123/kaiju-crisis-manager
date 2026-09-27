import { RuleResult, ViolationCode, fail, ok, violation } from './violations';
import { StockSnapshot } from './types';

export const RETENTION_DEFAULT_PCT = 0.3;
export const RETENTION_LOWERED_PCT = 0.15;

// Computed from the frozen initial quantity, never the current one.
// Recompute on the current stock and the floor drops with every transfer —
// a quarter can then be emptied one legal move at a time.
export function retentionMinimum(retentionBase: number, pct: number): number {
  return Math.ceil(retentionBase * pct);
}

// What is actually free: physical stock minus reservations and minus units
// already promised to a pending transfer.
export function availableQuantity(stock: StockSnapshot): number {
  return Math.max(
    0,
    stock.currentQuantity - stock.reservedQuantity - stock.committedOutbound,
  );
}

export function transferableSurplus(stock: StockSnapshot): number {
  const min = retentionMinimum(stock.retentionBase, stock.retentionPct);
  return Math.max(0, availableQuantity(stock) - min);
}

export interface RetentionCheck {
  available: number;
  minimum: number;
  surplus: number;
  remainingAfter: number;
}

// Order matters: a plain shortage is INSUFFICIENT_STOCK, only units the
// quarter holds but must keep are a RETENTION_THRESHOLD_BREACH.
export function checkOutflow(
  stock: StockSnapshot,
  quantity: number,
): RuleResult<RetentionCheck> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return fail(
      violation(ViolationCode.INVALID_QUANTITY, 'Quantity must be a positive integer.', {
        quantity,
      }),
    );
  }

  const available = availableQuantity(stock);
  const minimum = retentionMinimum(stock.retentionBase, stock.retentionPct);
  const surplus = Math.max(0, available - minimum);

  if (quantity > available) {
    return fail(
      violation(
        ViolationCode.INSUFFICIENT_STOCK,
        `District ${stock.districtCode} only has ${available} available unit(s) of ${stock.resourceCode}.`,
        { districtCode: stock.districtCode, resourceCode: stock.resourceCode, requested: quantity, available },
      ),
    );
  }

  if (available - quantity < minimum) {
    return fail(
      violation(
        ViolationCode.RETENTION_THRESHOLD_BREACH,
        `District ${stock.districtCode} must retain at least ${minimum} unit(s) of ${stock.resourceCode} (${Math.round(stock.retentionPct * 100)}% of its initial ${stock.retentionBase}). At most ${surplus} unit(s) may leave.`,
        {
          districtCode: stock.districtCode,
          resourceCode: stock.resourceCode,
          requested: quantity,
          available,
          minimum,
          maxTransferable: surplus,
          retentionPct: stock.retentionPct,
          retentionBase: stock.retentionBase,
        },
      ),
    );
  }

  return ok({ available, minimum, surplus, remainingAfter: available - quantity });
}

// A local reservation may dip below the floor. The floor exists so a quarter
// is not emptied to serve ANOTHER one; reserving does not move anything out.
export function checkReservation(
  stock: StockSnapshot,
  quantity: number,
): RuleResult<RetentionCheck> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return fail(
      violation(ViolationCode.INVALID_QUANTITY, 'Quantity must be a positive integer.', {
        quantity,
      }),
    );
  }

  const available = availableQuantity(stock);
  const minimum = retentionMinimum(stock.retentionBase, stock.retentionPct);

  if (quantity > available) {
    return fail(
      violation(
        ViolationCode.INSUFFICIENT_STOCK,
        `District ${stock.districtCode} only has ${available} available unit(s) of ${stock.resourceCode}.`,
        {
          districtCode: stock.districtCode,
          resourceCode: stock.resourceCode,
          requested: quantity,
          available,
        },
      ),
    );
  }

  return ok({
    available,
    minimum,
    surplus: Math.max(0, available - minimum),
    remainingAfter: available - quantity,
  });
}
