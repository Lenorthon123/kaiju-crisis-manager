import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, PrismaTransaction } from '../prisma/prisma.service';
import { lockStocks } from '../prisma/locking';
import { DomainContextService } from '../domain-context/domain-context.service';
import { AuditService } from '../audit/audit.service';
import { EventsGateway } from '../realtime/events.gateway';
import { AuthenticatedUser, toActor } from '../auth/authenticated-user';
import { RuleViolationException } from '../common/errors/rule-violation.exception';
import { StockRow, toSnapshot, toView } from '../resources/stock.view';
import {
  DistrictCode,
  RuleViolation,
  StockSnapshot,
  TransferDecision,
  ViolationCode,
  availableQuantity,
  evaluateTransfer,
  neighbours,
  violation,
} from '../domain';
import { CreateTransferDto } from './dto/transfer.dto';

const STOCK_INCLUDE = {
  district: { select: { id: true, code: true } },
  resourceType: { select: { id: true, code: true, name: true } },
} as const;

interface TransferLegRow {
  id: string;
  sequence: number;
  fromNode: string;
  toNode: string;
  approvalRequired: boolean;
  status: string;
  etaHours: number;
}

const TRANSFER_INCLUDE = {
  source: { select: { id: true, code: true } },
  destination: { select: { id: true, code: true } },
  resourceType: { select: { id: true, code: true, name: true } },
  initiator: { select: { id: true, displayName: true, role: true } },
  legs: { orderBy: { sequence: 'asc' } },
} as const;

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: DomainContextService,
    private readonly audit: AuditService,
    private readonly events: EventsGateway,
  ) {}

  // The quantity is booked as committedOutbound in the same transaction that
  // validated it. That is what makes a second, simultaneous request fail
  // cleanly instead of promising the same crates twice.
  async request(user: AuthenticatedUser, dto: CreateTransferDto) {
    const [graph, matrix] = await Promise.all([
      this.context.getGraph(),
      this.context.getPermissionMatrix(),
    ]);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const level = await this.context.getCatastropheLevel(tx);
      const policy = await this.context.getRetentionPolicy(tx);

      const sourceStock = await this.findStock(tx, dto.sourceDistrict, dto.resourceCode);
      const destStock = await this.findStock(tx, dto.destinationDistrict, dto.resourceCode);

      const neighbourCodes = neighbours(graph, dto.destinationDistrict as DistrictCode, 'LAND')
        .filter((n): n is DistrictCode => n !== 'SEA')
        .filter((n) => n !== dto.sourceDistrict);

      const neighbourStocks = await tx.stock.findMany({
        where: {
          district: { code: { in: neighbourCodes } },
          resourceType: { code: dto.resourceCode },
        },
        include: STOCK_INCLUDE,
        orderBy: { district: { code: 'asc' } },
      });

      await lockStocks(tx, [sourceStock.id, destStock.id]);
      const lockedSource = await this.reloadStock(tx, sourceStock.id);

      const sourceSnapshot = toSnapshot(lockedSource, policy.for(lockedSource.district.id));
      const adjacentSnapshots: StockSnapshot[] = neighbourStocks.map((row: StockRow) =>
        toSnapshot(row, policy.for(row.district.id)),
      );

      const decision = evaluateTransfer(
        graph,
        matrix,
        {
          actor: toActor(user),
          level,
          source: dto.sourceDistrict as DistrictCode,
          destination: dto.destinationDistrict as DistrictCode,
          quantity: dto.quantity,
          sourceStock: sourceSnapshot,
          adjacentToDestinationStocks: adjacentSnapshots,
          preferredMode: dto.mode,
          isRequisition: dto.requisition ?? false,
        },
        this.context.timing,
      );

      if (!decision.ok) {
        return {
          ok: false as const,
          violation: decision.violation,
          snapshot: sourceSnapshot,
        };
      }

      const created = await this.persist(tx, user, dto, decision.value, lockedSource);

      const updatedSource = await tx.stock.update({
        where: { id: lockedSource.id },
        data: { committedOutbound: { increment: dto.quantity } },
        include: STOCK_INCLUDE,
      });

      await this.audit.allowed(
        user.id,
        'TRANSFER_REQUEST',
        {
          transferId: created.id,
          source: dto.sourceDistrict,
          destination: dto.destinationDistrict,
          quantity: dto.quantity,
          mode: decision.value.route.mode,
        },
        tx,
      );

      return {
        ok: true as const,
        transfer: created,
        view: toView(updatedSource as StockRow, policy.for(lockedSource.district.id)),
      };
    });

    if (!outcome.ok) {
      await this.handleRejection(user, dto, outcome.violation, outcome.snapshot);
      throw new RuleViolationException(outcome.violation);
    }

    this.events.emitResourceUpdated({ ...this.stockEvent(outcome.view), reason: 'TRANSFER_COMMITTED' });
    this.events.emitTransferCreated(this.transferEvent(outcome.transfer));
    return outcome.transfer;
  }

  private async persist(
    tx: PrismaTransaction,
    user: AuthenticatedUser,
    dto: CreateTransferDto,
    decision: TransferDecision,
    sourceStock: StockRow & { id: string },
  ) {
    const destination = await tx.district.findUniqueOrThrow({
      where: { code: dto.destinationDistrict },
    });

    const isRequisition = dto.requisition ?? false;
    const needsTransitApproval = decision.route.legs.some((l) => l.approvalRequired);

    // Great power, still no free pass: a requisition skips the source QC's
    // approval — that is its whole point — but an intermediate quarter still
    // says yes or no to traffic on its roads.
    const status = isRequisition
      ? needsTransitApproval
        ? 'PENDING_TRANSIT_APPROVAL'
        : 'APPROVED'
      : 'PENDING_SOURCE_APPROVAL';

    return tx.transfer.create({
      data: {
        initiatorId: user.id,
        sourceDistrictId: sourceStock.district.id,
        destDistrictId: destination.id,
        resourceTypeId: sourceStock.resourceType.id,
        quantity: dto.quantity,
        mode: decision.route.mode,
        status,
        isRequisition,
        priority: decision.priority,
        etaHours: decision.etaHours,
        legs: {
          create: decision.route.legs.map((leg) => ({
            sequence: leg.sequence,
            fromNode: leg.from,
            toNode: leg.to,
            linkType: leg.type,
            approvalRequired: leg.approvalRequired,
            status: leg.approvalRequired ? 'PENDING' : 'APPROVED',
            etaHours: leg.etaHours,
          })),
        },
      },
      include: TRANSFER_INCLUDE,
    });
  }

  // A refusal over scarce units is the "two teams, same resource" conflict the
  // subject wants broadcast in real time.
  private async handleRejection(
    user: AuthenticatedUser,
    dto: CreateTransferDto,
    v: RuleViolation,
    snapshot: StockSnapshot,
  ) {
    await this.audit.rejected(user.id, 'TRANSFER_REQUEST', v, {
      source: dto.sourceDistrict,
      destination: dto.destinationDistrict,
      resourceCode: dto.resourceCode,
      quantity: dto.quantity,
    });

    const contentionCodes: string[] = [
      ViolationCode.INSUFFICIENT_STOCK,
      ViolationCode.RETENTION_THRESHOLD_BREACH,
    ];
    if (!contentionCodes.includes(v.code)) return;

    const competitors = await this.prisma.transfer.findMany({
      where: {
        source: { code: dto.sourceDistrict },
        resourceType: { code: dto.resourceCode },
        status: { in: ['PENDING_SOURCE_APPROVAL', 'PENDING_TRANSIT_APPROVAL', 'APPROVED', 'IN_TRANSIT'] },
      },
      select: { id: true, initiatorId: true },
    });

    this.events.emitTransferConflict({
      districtCode: snapshot.districtCode,
      resourceCode: snapshot.resourceCode,
      requested: dto.quantity,
      available: availableQuantity(snapshot),
      violationCode: v.code,
      contenders: competitors.map((c) => ({ transferId: c.id, initiatorId: c.initiatorId })),
      occurredAt: new Date().toISOString(),
    });
  }

  async approveSource(user: AuthenticatedUser, transferId: string) {
    const transfer = await this.loadTransfer(transferId);

    this.assertStatus(transfer.status, ['PENDING_SOURCE_APPROVAL']);
    this.assertQuarterOfficer(user, transfer.source.code, 'approve this transfer');

    const needsTransit = transfer.legs.some(
      (leg: TransferLegRow) => leg.approvalRequired && leg.status === 'PENDING',
    );
    const status = needsTransit ? 'PENDING_TRANSIT_APPROVAL' : 'APPROVED';

    const updated = await this.prisma.transfer.update({
      where: { id: transferId },
      data: status === 'APPROVED' ? this.scheduleData(transfer.etaHours) : { status },
      include: TRANSFER_INCLUDE,
    });

    await this.audit.allowed(user.id, 'TRANSFER_APPROVE_SOURCE', { transferId, status });
    this.events.emitTransferUpdated(this.transferEvent(updated));
    return updated;
  }

  async approveLeg(user: AuthenticatedUser, transferId: string, legId: string) {
    const transfer = await this.loadTransfer(transferId);
    this.assertStatus(transfer.status, ['PENDING_TRANSIT_APPROVAL']);

    const leg = transfer.legs.find((candidate: TransferLegRow) => candidate.id === legId);
    if (!leg) {
      throw new NotFoundException({ code: 'UNKNOWN_LEG', message: 'Unknown transfer leg.' });
    }
    if (!leg.approvalRequired) {
      throw new RuleViolationException(
        violation(
          ViolationCode.INVALID_TRANSFER_STATE,
          'This leg does not require an approval.',
          { legId },
        ),
      );
    }
    if (leg.status !== 'PENDING') {
      throw new RuleViolationException(
        violation(
          ViolationCode.INVALID_TRANSFER_STATE,
          `Leg is already ${leg.status}.`,
          { legId, status: leg.status },
        ),
      );
    }

    this.assertQuarterOfficer(user, leg.fromNode, 'approve this transit');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.transferLeg.update({
        where: { id: legId },
        data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
      });

      const remaining = await tx.transferLeg.count({
        where: { transferId, approvalRequired: true, status: 'PENDING' },
      });

      return tx.transfer.update({
        where: { id: transferId },
        data: remaining === 0 ? this.scheduleData(transfer.etaHours) : {},
        include: TRANSFER_INCLUDE,
      });
    });

    await this.audit.allowed(user.id, 'TRANSFER_APPROVE_TRANSIT', { transferId, legId });
    this.events.emitTransferUpdated(this.transferEvent(updated));
    return updated;
  }

  async reject(user: AuthenticatedUser, transferId: string, reason?: string) {
    const transfer = await this.loadTransfer(transferId);
    this.assertStatus(transfer.status, [
      'PENDING_SOURCE_APPROVAL',
      'PENDING_TRANSIT_APPROVAL',
      'APPROVED',
    ]);

    const involved = [
      transfer.source.code,
      ...transfer.legs
        .filter((leg: TransferLegRow) => leg.approvalRequired)
        .map((leg: TransferLegRow) => leg.fromNode),
    ];
    if (user.role === 'QC' && !involved.includes(user.districtCode ?? '')) {
      throw new RuleViolationException(
        violation(
          ViolationCode.OUT_OF_SCOPE_QUARTER,
          `Quarter ${user.districtCode} is not on the route of this transfer.`,
          { actorDistrict: user.districtCode, routeQuarters: involved },
        ),
      );
    }

    const { view, updated } = await this.prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUniqueOrThrow({
        where: {
          districtId_resourceTypeId: {
            districtId: transfer.sourceDistrictId,
            resourceTypeId: transfer.resourceTypeId,
          },
        },
      });
      await lockStocks(tx, [stock.id]);

      const released = await tx.stock.update({
        where: { id: stock.id },
        data: { committedOutbound: { decrement: transfer.quantity } },
        include: STOCK_INCLUDE,
      });

      const result = await tx.transfer.update({
        where: { id: transferId },
        data: {
          status: 'REJECTED',
          rejectionCode: 'REJECTED_BY_OFFICER',
          rejectionReason: reason ?? null,
        },
        include: TRANSFER_INCLUDE,
      });

      const policy = await this.context.getRetentionPolicy(tx);
      return {
        view: toView(released as StockRow, policy.for(transfer.sourceDistrictId)),
        updated: result,
      };
    });

    await this.audit.allowed(user.id, 'TRANSFER_REJECT', { transferId, reason: reason ?? null });
    this.events.emitResourceUpdated({ ...this.stockEvent(view), reason: 'TRANSFER_CANCELLED' });
    this.events.emitTransferUpdated(this.transferEvent(updated));
    return updated;
  }

  async deliver(user: AuthenticatedUser, transferId: string) {
    const transfer = await this.loadTransfer(transferId);
    this.assertStatus(transfer.status, ['APPROVED', 'IN_TRANSIT']);
    this.assertQuarterOfficer(user, transfer.destination.code, 'confirm this delivery');

    const { sourceView, destView, updated } = await this.prisma.$transaction(async (tx) => {
      const [sourceStock, destStock] = await Promise.all([
        tx.stock.findUniqueOrThrow({
          where: {
            districtId_resourceTypeId: {
              districtId: transfer.sourceDistrictId,
              resourceTypeId: transfer.resourceTypeId,
            },
          },
        }),
        tx.stock.findUniqueOrThrow({
          where: {
            districtId_resourceTypeId: {
              districtId: transfer.destDistrictId,
              resourceTypeId: transfer.resourceTypeId,
            },
          },
        }),
      ]);

      await lockStocks(tx, [sourceStock.id, destStock.id]);

      const source = await tx.stock.update({
        where: { id: sourceStock.id },
        data: {
          currentQuantity: { decrement: transfer.quantity },
          committedOutbound: { decrement: transfer.quantity },
        },
        include: STOCK_INCLUDE,
      });

      const destination = await tx.stock.update({
        where: { id: destStock.id },
        data: { currentQuantity: { increment: transfer.quantity } },
        include: STOCK_INCLUDE,
      });

      await tx.transferLeg.updateMany({ where: { transferId }, data: { status: 'DELIVERED' } });

      const result = await tx.transfer.update({
        where: { id: transferId },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
        include: TRANSFER_INCLUDE,
      });

      const policy = await this.context.getRetentionPolicy(tx);
      return {
        sourceView: toView(source as StockRow, policy.for(transfer.sourceDistrictId)),
        destView: toView(destination as StockRow, policy.for(transfer.destDistrictId)),
        updated: result,
      };
    });

    await this.audit.allowed(user.id, 'TRANSFER_DELIVER', { transferId });
    this.events.emitResourceUpdated({ ...this.stockEvent(sourceView), reason: 'TRANSFER_DELIVERED' });
    this.events.emitResourceUpdated({ ...this.stockEvent(destView), reason: 'TRANSFER_DELIVERED' });
    this.events.emitTransferUpdated(this.transferEvent(updated));
    return updated;
  }

  // Ordered by the annex's rule 5.
  list(filters: { district?: string; status?: string }) {
    return this.prisma.transfer.findMany({
      where: {
        status: filters.status ? (filters.status as never) : undefined,
        OR: filters.district
          ? [
              { source: { code: filters.district } },
              { destination: { code: filters.district } },
              { legs: { some: { fromNode: filters.district } } },
            ]
          : undefined,
      },
      include: TRANSFER_INCLUDE,
      orderBy: [{ priority: 'asc' }, { requestedAt: 'asc' }],
    });
  }

  pendingFor(districtCode: string) {
    return this.prisma.transfer.findMany({
      where: {
        OR: [
          { source: { code: districtCode }, status: 'PENDING_SOURCE_APPROVAL' },
          {
            status: 'PENDING_TRANSIT_APPROVAL',
            legs: { some: { fromNode: districtCode, approvalRequired: true, status: 'PENDING' } },
          },
        ],
      },
      include: TRANSFER_INCLUDE,
      orderBy: [{ priority: 'asc' }, { requestedAt: 'asc' }],
    });
  }

  private scheduleData(etaHours: number) {
    const departureAt = new Date();
    const estimatedDeliveryAt = new Date(departureAt.getTime() + etaHours * 3_600_000);
    return { status: 'APPROVED' as const, departureAt, estimatedDeliveryAt };
  }

  private async loadTransfer(id: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: TRANSFER_INCLUDE,
    });
    if (!transfer) {
      throw new NotFoundException({ code: 'UNKNOWN_TRANSFER', message: 'Transfer not found.' });
    }
    return transfer;
  }

  private assertStatus(current: string, allowed: string[]) {
    if (!allowed.includes(current)) {
      throw new RuleViolationException(
        violation(
          ViolationCode.INVALID_TRANSFER_STATE,
          `Transfer is ${current}; this action requires one of ${allowed.join(', ')}.`,
          { current, allowed },
        ),
      );
    }
  }

  // LC and CD act city-wide; a QC only on the quarter it coordinates.
  private assertQuarterOfficer(user: AuthenticatedUser, districtCode: string, what: string) {
    if (user.role !== 'QC') return;
    if (user.districtCode !== districtCode) {
      throw new RuleViolationException(
        violation(
          ViolationCode.OUT_OF_SCOPE_QUARTER,
          `Quarter Coordinator of ${user.districtCode} cannot ${what} for quarter ${districtCode}.`,
          { actorDistrict: user.districtCode, targetDistrict: districtCode },
        ),
      );
    }
  }

  private async findStock(tx: PrismaTransaction, districtCode: string, resourceCode: string) {
    const stock = await tx.stock.findFirst({
      where: { district: { code: districtCode }, resourceType: { code: resourceCode } },
      include: STOCK_INCLUDE,
    });
    if (!stock) {
      throw new NotFoundException({
        code: 'UNKNOWN_RESOURCE',
        message: `No stock of ${resourceCode} recorded for quarter ${districtCode}.`,
      });
    }
    return stock as StockRow & { id: string };
  }

  private async reloadStock(tx: PrismaTransaction, id: string) {
    return (await tx.stock.findUniqueOrThrow({
      where: { id },
      include: STOCK_INCLUDE,
    })) as StockRow & { id: string };
  }

  private stockEvent(view: ReturnType<typeof toView>) {
    return {
      districtCode: view.districtCode,
      resourceCode: view.resourceCode,
      currentQuantity: view.currentQuantity,
      reservedQuantity: view.reservedQuantity,
      committedOutbound: view.committedOutbound,
      available: view.available,
      retentionMinimum: view.retentionMinimum,
      transferableSurplus: view.transferableSurplus,
    };
  }

  private transferEvent(transfer: {
    id: string;
    quantity: number;
    mode: string;
    status: string;
    estimatedDeliveryAt: Date | null;
    source: { code: string };
    destination: { code: string };
    resourceType: { code: string };
    legs: { fromNode: string; approvalRequired: boolean }[];
  }) {
    return {
      transferId: transfer.id,
      sourceDistrict: transfer.source.code as DistrictCode,
      destinationDistrict: transfer.destination.code as DistrictCode,
      resourceCode: transfer.resourceType.code,
      quantity: transfer.quantity,
      mode: transfer.mode as 'DIRECT' | 'TRANSIT' | 'MARITIME',
      status: transfer.status,
      transitDistricts: transfer.legs
        .filter((leg) => leg.approvalRequired)
        .map((leg) => leg.fromNode as DistrictCode),
      estimatedDeliveryAt: transfer.estimatedDeliveryAt
        ? transfer.estimatedDeliveryAt.toISOString()
        : null,
    };
  }
}
