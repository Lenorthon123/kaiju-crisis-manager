import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { lockStocks } from '../prisma/locking';
import { DomainContextService } from '../domain-context/domain-context.service';
import { EventsGateway } from '../realtime/events.gateway';
import { AuditService } from '../audit/audit.service';
import { StockRow, toView } from '../resources/stock.view';
import { DistrictCode, expiredReservations, shouldDepart } from '../domain';

const STOCK_INCLUDE = {
  district: { select: { id: true, code: true } },
  resourceType: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
// Nobody clicks "time passes".
// Two things move on their own: a reservation window closes, and an approved
// transfer reaches its departure time. Without this, reserved units stay
// locked forever and IN_TRANSIT is a state the enum declares but never reaches.
// The pass is idempotent — each row it touches leaves its own selection.
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: DomainContextService,
    private readonly events: EventsGateway,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  // Off under test. approveSource sets departureAt to now, so a tick firing
  // between two assertions would flip APPROVED to IN_TRANSIT on its own.
  // The tests call reconcile(now) themselves.
  private get tickEnabled(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'test';
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'reconcile' })
  async onTick(): Promise<void> {
    if (!this.tickEnabled) return;
    await this.reconcile();
  }

  async reconcile(now: Date = new Date()): Promise<{ released: number; departed: number }> {
    if (this.running) {
      this.logger.warn('Previous reconciliation still running, skipping this tick');
      return { released: 0, departed: 0 };
    }
    this.running = true;
    try {
      const released = await this.releaseExpiredReservations(now);
      const departed = await this.departApprovedTransfers(now);
      if (released > 0 || departed > 0) {
        this.logger.log(`Reconciled: ${released} reservation(s) released, ${departed} departed`);
      }
      return { released, departed };
    } catch (error) {
      this.logger.error('Reconciliation pass failed', error as Error);
      return { released: 0, departed: 0 };
    } finally {
      this.running = false;
    }
  }

  async releaseExpiredReservations(now: Date): Promise<number> {
    const candidates = await this.prisma.reservation.findMany({
      where: { status: 'ACTIVE', endAt: { lte: now } },
      orderBy: { endAt: 'asc' },
    });

    const due = expiredReservations(
      candidates.map((r) => ({ id: r.id, status: r.status, endAt: r.endAt, quantity: r.quantity })),
      now,
    );
    if (due.length === 0) return 0;

    for (const reservation of due) {
      const row = candidates.find((c) => c.id === reservation.id);
      if (!row) continue;

      try {
        const view = await this.prisma.$transaction(async (tx) => {
          // Re-read under the lock: an officer may have released it by hand between
          // the scan and now, and decrementing twice would go negative.
          const current = await tx.reservation.findUnique({ where: { id: row.id } });
          if (!current || current.status !== 'ACTIVE') return null;

          const stock = await tx.stock.findUniqueOrThrow({
            where: {
              districtId_resourceTypeId: {
                districtId: current.districtId,
                resourceTypeId: current.resourceTypeId,
              },
            },
          });
          await lockStocks(tx, [stock.id]);

          const updated = await tx.stock.update({
            where: { id: stock.id },
            data: { reservedQuantity: { decrement: current.quantity } },
            include: STOCK_INCLUDE,
          });

          await tx.reservation.update({
            where: { id: current.id },
            data: { status: 'RELEASED' },
          });

          const policy = await this.context.getRetentionPolicy(tx);
          return toView(updated as StockRow, policy.for(current.districtId));
        });

        if (!view) continue;

        await this.audit.allowed(null, 'RESERVATION_EXPIRED', {
          reservationId: row.id,
          quantity: row.quantity,
        });

        this.events.emitResourceUpdated({
          districtCode: view.districtCode,
          resourceCode: view.resourceCode,
          currentQuantity: view.currentQuantity,
          reservedQuantity: view.reservedQuantity,
          committedOutbound: view.committedOutbound,
          available: view.available,
          retentionMinimum: view.retentionMinimum,
          transferableSurplus: view.transferableSurplus,
          reason: 'RELEASE',
        });
      } catch (error) {
        this.logger.error(`Failed to release reservation ${row.id}`, error as Error);
      }
    }

    return due.length;
  }

  async departApprovedTransfers(now: Date): Promise<number> {
    const candidates = await this.prisma.transfer.findMany({
      where: { status: 'APPROVED', departureAt: { lte: now } },
      include: {
        source: { select: { id: true, code: true } },
        destination: { select: { id: true, code: true } },
        resourceType: { select: { id: true, code: true, name: true } },
        legs: { orderBy: { sequence: 'asc' } },
      },
      orderBy: [{ priority: 'asc' }, { departureAt: 'asc' }],
    });

    const due = candidates.filter((t) =>
      shouldDepart({ id: t.id, status: t.status, departureAt: t.departureAt }, now),
    );
    if (due.length === 0) return 0;

    for (const transfer of due) {
      try {
        const updated = await this.prisma.transfer.update({
          where: { id: transfer.id, status: 'APPROVED' },
          data: { status: 'IN_TRANSIT', legs: { updateMany: { where: {}, data: { status: 'IN_TRANSIT' } } } },
          include: {
            source: { select: { id: true, code: true } },
            destination: { select: { id: true, code: true } },
            resourceType: { select: { id: true, code: true, name: true } },
            legs: { orderBy: { sequence: 'asc' } },
          },
        });

        await this.audit.allowed(null, 'TRANSFER_DEPARTED', { transferId: transfer.id });

        this.events.emitTransferUpdated({
          transferId: updated.id,
          sourceDistrict: updated.source.code as DistrictCode,
          destinationDistrict: updated.destination.code as DistrictCode,
          resourceCode: updated.resourceType.code,
          quantity: updated.quantity,
          mode: updated.mode,
          status: updated.status,
          transitDistricts: updated.legs
            .filter((l) => l.approvalRequired)
            .map((l) => l.fromNode as DistrictCode),
          estimatedDeliveryAt: updated.estimatedDeliveryAt
            ? updated.estimatedDeliveryAt.toISOString()
            : null,
        });
      } catch (error) {
        this.logger.warn(`Transfer ${transfer.id} could not be marked in transit`);
        this.logger.debug(error as Error);
      }
    }

    return due.length;
  }
}
