import {
  ActionKey,
  Actor,
  CatastropheLevel,
  Severity,
  DEFAULT_TIMING,
  DistrictCode,
  PermissionMatrix,
  Route,
  StockSnapshot,
  TimingConfig,
  TopologyGraph,
  TransferMode,
} from './types';
import { checkPermission, checkScope } from './permissions';
import { areAdjacent, buildRoutes, computePriority, hasSeaAccess } from './topology';
import { checkOutflow, checkReservation, transferableSurplus } from './retention';
import {
  RuleResult,
  RuleViolation,
  ViolationCode,
  fail,
  ok,
  violation,
} from './violations';

export interface TransferRequest {
  actor: Actor;
  level: CatastropheLevel;
  source: DistrictCode;
  destination: DistrictCode;
  quantity: number;
  sourceStock: StockSnapshot;
  adjacentToDestinationStocks: StockSnapshot[];
  preferredMode?: TransferMode;
  isRequisition?: boolean;
}

export interface TransferDecision {
  route: Route;
  requiredAction: ActionKey;
  priority: number;
  transitDistricts: DistrictCode[];
  etaHours: number;
  remainingSurplus: number;
}

// Evaluation order: input, level gating, permission, scope, topology,
// adjacency priority, retention.
// Rights before state, always: we never tell someone what a neighbour has in
// stock if they had no business asking in the first place.
export function evaluateTransfer(
  graph: TopologyGraph,
  matrix: PermissionMatrix,
  req: TransferRequest,
  timing: TimingConfig = DEFAULT_TIMING,
): RuleResult<TransferDecision> {
  const { actor, level, source, destination, quantity } = req;

  if (source === destination) {
    return fail(
      violation(
        ViolationCode.SAME_SOURCE_AND_DESTINATION,
        'Source and destination quarters must differ.',
        { source, destination },
      ),
    );
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return fail(
      violation(ViolationCode.INVALID_QUANTITY, 'Quantity must be a positive integer.', {
        quantity,
      }),
    );
  }

  const adjacent = areAdjacent(graph, source, destination);

  if (level <= 2) {
    return fail(
      violation(
        ViolationCode.INTER_QUARTER_TRANSFER_FORBIDDEN,
        `Inter-quarter transfers are not authorised at catastrophe level ${level}. Level 3 (Emergency) is required.`,
        { level, required: 3 },
      ),
    );
  }
  if (!adjacent && level === 3) {
    return fail(
      violation(
        ViolationCode.TRANSIT_FORBIDDEN_AT_LEVEL,
        `Quarters ${source} and ${destination} are not adjacent; extended transfers require catastrophe level 4.`,
        { level, required: 4, source, destination },
      ),
    );
  }

  const requiredAction: ActionKey = req.isRequisition
    ? 'REQUISITION'
    : adjacent
      ? 'REQUEST_ADJACENT_TRANSFER'
      : 'ORGANIZE_TRANSIT';

  const permission = checkPermission(matrix, actor, requiredAction, level);
  if (!permission.ok) return permission as RuleResult<TransferDecision>;

  if (actor.role === 'QC') {
    const scope = checkScope(actor, destination);
    if (!scope.ok) return scope as RuleResult<TransferDecision>;
  }

  const routes = buildRoutes(graph, source, destination, timing);
  if (routes.length === 0) {
    return fail(
      violation(
        ViolationCode.NO_ROUTE_AVAILABLE,
        `No land or maritime route exists between ${source} and ${destination}.`,
        { source, destination },
      ),
    );
  }

  const routeResult = selectRoute(routes, req, level, source, destination, graph);
  if (!routeResult.ok) return routeResult as RuleResult<TransferDecision>;
  const route = routeResult.value;

  if (!adjacent) {
  // Biggest surplus first, then alphabetical. Picking whatever row the database
  // returned first made the error message change between two identical calls.
    const betterSource = req.adjacentToDestinationStocks
      .filter((candidate) => transferableSurplus(candidate) >= quantity)
      .sort((a, b) => {
        const diff = transferableSurplus(b) - transferableSurplus(a);
        return diff !== 0 ? diff : a.districtCode.localeCompare(b.districtCode);
      })[0];

    if (betterSource) {
      return fail(
        violation(
          ViolationCode.ADJACENT_SOURCE_AVAILABLE,
          `Quarter ${betterSource.districtCode} is adjacent to ${destination} and holds a sufficient surplus (${transferableSurplus(betterSource)}); adjacent quarters must be solicited first.`,
          {
            source,
            destination,
            quantity,
            adjacentCandidate: betterSource.districtCode,
            adjacentSurplus: transferableSurplus(betterSource),
          },
        ),
      );
    }
  }

  const outflow = checkOutflow(req.sourceStock, quantity);
  if (!outflow.ok) return outflow as RuleResult<TransferDecision>;

  return ok({
    route,
    requiredAction,
    priority: computePriority(route, source, destination),
    transitDistricts: route.transitDistricts,
    etaHours: route.totalEtaHours,
    remainingSurplus: Math.max(0, outflow.value.surplus - quantity),
  });
}

// Rule 4 calls the sea route an alternative; level 5 is what "prioritizes" it.
// So below level 5 an overland route of equal duration wins.
function selectRoute(
  routes: Route[],
  req: TransferRequest,
  level: CatastropheLevel,
  source: DistrictCode,
  destination: DistrictCode,
  graph: TopologyGraph,
): RuleResult<Route> {
  if (req.preferredMode) {
    const forced = routes.find((r) => r.mode === req.preferredMode);
    if (!forced) {
      if (req.preferredMode === 'MARITIME') {
        const offender = !hasSeaAccess(graph, source) ? source : destination;
        return fail(
          violation(
            ViolationCode.MARITIME_ROUTE_UNAVAILABLE,
            `Quarter ${offender} is landlocked; the maritime route is only available to Echo, Xeno and Zion.`,
            { source, destination, landlocked: offender },
          ),
        );
      }
      if (req.preferredMode === 'DIRECT') {
        return fail(
          violation(
            ViolationCode.NOT_ADJACENT,
            `Quarters ${source} and ${destination} do not share a border; a direct transfer is impossible.`,
            { source, destination },
          ),
        );
      }
      return fail(
        violation(
          ViolationCode.NO_ROUTE_AVAILABLE,
          `No ${req.preferredMode} route exists between ${source} and ${destination}.`,
          { source, destination, mode: req.preferredMode },
        ),
      );
    }
    return ok(forced);
  }

  if (level === 5) {
    const maritime = routes.find((r) => r.mode === 'MARITIME');
    if (maritime) return ok(maritime);
  }

  return ok(routes[0]);
}

export interface ReservationRequest {
  actor: Actor;
  level: CatastropheLevel;
  district: DistrictCode;
  quantity: number;
  stock: StockSnapshot;
}

export function evaluateReservation(
  matrix: PermissionMatrix,
  req: ReservationRequest,
): RuleResult<{ remainingAfter: number }> {
  const { actor, level, district, quantity } = req;

  if (level === 1) {
    return fail(
      violation(
        ViolationCode.NO_RESERVATION_AT_LEVEL_1,
        'Catastrophe level 1 (Watch) is a monitoring phase: resources stay in place and no reservation is allowed.',
        { level },
      ),
    );
  }

  const permission = checkPermission(matrix, actor, 'RESERVE_OWN_QUARTER', level);
  if (!permission.ok) return permission as RuleResult<{ remainingAfter: number }>;

  const scope = checkScope(actor, district);
  if (!scope.ok) return scope as RuleResult<{ remainingAfter: number }>;

  const check = checkReservation(req.stock, quantity);
  if (!check.ok) return check as RuleResult<{ remainingAfter: number }>;

  return ok({ remainingAfter: check.value.remainingAfter });
}

export function evaluateRetentionOverride(
  matrix: PermissionMatrix,
  actor: Actor,
  level: CatastropheLevel,
  pct: number,
  allowedPct: number,
): RuleResult<{ pct: number }> {
  if (level !== 5) {
    return fail(
      violation(
        ViolationCode.RETENTION_OVERRIDE_REQUIRES_LEVEL_5,
        `The retention threshold can only be lowered at catastrophe level 5 (current: ${level}).`,
        { level },
      ),
    );
  }

  if (actor.role !== 'CD') {
    return fail(
      violation(
        ViolationCode.RETENTION_OVERRIDE_REQUIRES_CD,
        'Only the City Director may lower the retention threshold.',
        { role: actor.role },
      ),
    );
  }

  const permission = checkPermission(matrix, actor, 'LOWER_RETENTION_THRESHOLD', level);
  if (!permission.ok) return permission as RuleResult<{ pct: number }>;

  if (pct !== allowedPct) {
    return fail(
      violation(
        ViolationCode.RETENTION_PCT_NOT_ALLOWED,
        `The retention threshold may only be lowered to ${Math.round(allowedPct * 100)}%.`,
        { requested: pct, allowed: allowedPct },
      ),
    );
  }

  return ok({ pct });
}

export type { RuleViolation };

export interface QueuedTransfer {
  // Annex rule 5, frozen when the request was made.
  priority: number;
  // Read live, so a quarter that escalates moves up the queue it is already in.
  destinationSeverity: Severity;
  requestedAt: Date;
}

// Orders a queue of requests. The annex rule comes first and severity only
// breaks its ties: an invented rule never overrides a published one. Within the
// same rank, the quarter on fire is served before the quiet one, and age
// settles the rest so the order never wobbles between two identical calls.
export function compareUrgency(a: QueuedTransfer, b: QueuedTransfer): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.destinationSeverity !== b.destinationSeverity) {
    return b.destinationSeverity - a.destinationSeverity;
  }
  return a.requestedAt.getTime() - b.requestedAt.getTime();
}
