import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  ViolationCode,
  availableQuantity,
  evaluateReservation,
  retentionMinimum,
  transferableSurplus,
} from '../domain';
import { CreateReservationDto } from './dto/reservation.dto';

const STOCK_INCLUDE = {
  district: { select: { id: true, code: true } },
  resourceType: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: DomainContextService,
    private readonly audit: AuditService,
    private readonly events: EventsGateway,
  ) {}

  // Check and write in one transaction behind a row lock, so the availability
  // the engine sees is the one that gets written.
  // A refusal is RETURNED, not thrown: throwing inside the callback would roll
  // back the audit entry recording that very refusal.
  async create(user: AuthenticatedUser, dto: CreateReservationDto) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) {
      throw new BadRequestException({
        code: 'INVALID_TIME_WINDOW',
        message: 'The reservation must end after it starts.',
      });
    }

    const matrix = await this.context.getPermissionMatrix();

    const outcome = await this.prisma.$transaction(async (tx) => {
      const level = await this.context.getCatastropheLevel(tx);
      const found = await this.findStock(tx, dto.districtCode, dto.resourceCode);

      await lockStocks(tx, [found.id]);
      const locked = await this.reloadStock(tx, found.id);

      const policy = await this.context.getRetentionPolicy(tx);
      const retentionPct = policy.for(locked.district.id);
      const snapshot = toSnapshot(locked, retentionPct);

      const decision = evaluateReservation(matrix, {
        actor: toActor(user),
        level,
        district: dto.districtCode as DistrictCode,
        quantity: dto.quantity,
        stock: snapshot,
      });

      if (!decision.ok) {
        return {
          ok: false as const,
          violation: decision.violation,
          contention: {
            districtCode: snapshot.districtCode,
            resourceCode: snapshot.resourceCode,
            available: availableQuantity(snapshot),
            retentionMinimum: retentionMinimum(snapshot.retentionBase, retentionPct),
            surplus: transferableSurplus(snapshot),
          },
        };
      }

      const updated = await tx.stock.update({
        where: { id: locked.id },
        data: { reservedQuantity: { increment: dto.quantity } },
        include: STOCK_INCLUDE,
      });

      const created = await tx.reservation.create({
        data: {
          requesterId: user.id,
          districtId: locked.district.id,
          resourceTypeId: locked.resourceType.id,
          quantity: dto.quantity,
          startAt,
          endAt,
        },
        include: {
          district: { select: { code: true } },
          resourceType: { select: { code: true, name: true } },
        },
      });

      await this.audit.allowed(
        user.id,
        'RESERVATION_CREATE',
        { reservationId: created.id, districtCode: dto.districtCode, quantity: dto.quantity },
        tx,
      );

      return {
        ok: true as const,
        reservation: created,
        view: toView(updated as StockRow, retentionPct),
      };
    });

    if (!outcome.ok) {
      await this.audit.rejected(user.id, 'RESERVATION_CREATE', outcome.violation, {
        districtCode: dto.districtCode,
        resourceCode: dto.resourceCode,
        quantity: dto.quantity,
      });

      if (outcome.violation.code === ViolationCode.INSUFFICIENT_STOCK) {
        this.events.emitTransferConflict({
          districtCode: outcome.contention.districtCode,
          resourceCode: outcome.contention.resourceCode,
          requested: dto.quantity,
          available: outcome.contention.available,
          violationCode: outcome.violation.code,
          contenders: [{ transferId: 'reservation', initiatorId: user.id }],
          occurredAt: new Date().toISOString(),
        });
      }

      throw new RuleViolationException(outcome.violation);
    }

    this.emitStock(outcome.view, 'RESERVATION');
    return outcome.reservation;
  }

  async release(user: AuthenticatedUser, reservationId: string) {
    const view = await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: { district: { select: { id: true, code: true } } },
      });
      if (!reservation) {
        throw new NotFoundException({
          code: 'UNKNOWN_RESERVATION',
          message: 'Reservation not found.',
        });
      }
      if (reservation.status !== 'ACTIVE') {
        throw new RuleViolationException({
          code: ViolationCode.INVALID_TRANSFER_STATE,
          httpStatus: 409,
          message: `Reservation is already ${reservation.status}.`,
          details: { status: reservation.status },
        });
      }
      if (user.role === 'QC' && user.districtId !== reservation.districtId) {
        throw new RuleViolationException({
          code: ViolationCode.OUT_OF_SCOPE_QUARTER,
          httpStatus: 403,
          message: `Quarter Coordinator of ${user.districtCode} cannot release a reservation of ${reservation.district.code}.`,
          details: { actorDistrict: user.districtCode, targetDistrict: reservation.district.code },
        });
      }

      const stock = await tx.stock.findUniqueOrThrow({
        where: {
          districtId_resourceTypeId: {
            districtId: reservation.districtId,
            resourceTypeId: reservation.resourceTypeId,
          },
        },
      });

      await lockStocks(tx, [stock.id]);

      const updated = await tx.stock.update({
        where: { id: stock.id },
        data: { reservedQuantity: { decrement: reservation.quantity } },
        include: STOCK_INCLUDE,
      });

      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED' },
      });

      await this.audit.allowed(user.id, 'RESERVATION_RELEASE', { reservationId }, tx);

      const policy = await this.context.getRetentionPolicy(tx);
      return toView(updated as StockRow, policy.for(reservation.districtId));
    });

    this.emitStock(view, 'RELEASE');
    return { released: reservationId };
  }

  list(districtCode?: string, status?: string) {
    return this.prisma.reservation.findMany({
      where: {
        district: districtCode ? { code: districtCode } : undefined,
        status: status ? (status as 'ACTIVE' | 'RELEASED' | 'CANCELLED') : undefined,
      },
      include: {
        district: { select: { code: true } },
        resourceType: { select: { code: true, name: true } },
        requester: { select: { id: true, displayName: true, role: true } },
      },
      orderBy: { startAt: 'asc' },
    });
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

  private emitStock(view: ReturnType<typeof toView>, reason: 'RESERVATION' | 'RELEASE') {
    this.events.emitResourceUpdated({
      districtCode: view.districtCode,
      resourceCode: view.resourceCode,
      currentQuantity: view.currentQuantity,
      reservedQuantity: view.reservedQuantity,
      committedOutbound: view.committedOutbound,
      available: view.available,
      retentionMinimum: view.retentionMinimum,
      transferableSurplus: view.transferableSurplus,
      reason,
    });
  }
}
