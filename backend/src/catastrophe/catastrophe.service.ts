import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { lockCityState } from '../prisma/locking';
import { DomainContextService } from '../domain-context/domain-context.service';
import { AuditService } from '../audit/audit.service';
import { EventsGateway } from '../realtime/events.gateway';
import { AuthenticatedUser, toActor } from '../auth/authenticated-user';
import { RuleViolationException } from '../common/errors/rule-violation.exception';
import {
  CATASTROPHE_LEVELS,
  CatastropheLevel,
  DistrictCode,
  ViolationCode,
  evaluateRetentionOverride,
  unlockLevel,
  violation,
} from '../domain';
import { LowerRetentionDto, SetLevelDto } from './dto/catastrophe.dto';

@Injectable()
export class CatastropheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: DomainContextService,
    private readonly audit: AuditService,
    private readonly events: EventsGateway,
  ) {}

  async current(user: AuthenticatedUser) {
    const [level, matrix] = await Promise.all([
      this.context.getCatastropheLevel(),
      this.context.getPermissionMatrix(),
    ]);
    const meta = CATASTROPHE_LEVELS.find((entry) => entry.level === level);

    return {
      level,
      name: meta?.name ?? 'Unknown',
      description: meta?.description ?? '',
      levels: CATASTROPHE_LEVELS,
      permissions: {
        reserveOwnQuarter: unlockLevel(matrix, user.role, 'RESERVE_OWN_QUARTER'),
        requestAdjacentTransfer: unlockLevel(matrix, user.role, 'REQUEST_ADJACENT_TRANSFER'),
        organizeTransit: unlockLevel(matrix, user.role, 'ORGANIZE_TRANSIT'),
        requisition: unlockLevel(matrix, user.role, 'REQUISITION'),
        lowerRetentionThreshold: unlockLevel(matrix, user.role, 'LOWER_RETENTION_THRESHOLD'),
      },
    };
  }

  async setLevel(user: AuthenticatedUser, dto: SetLevelDto) {
    if (user.role !== 'CD') {
      throw new RuleViolationException(
        violation(
          ViolationCode.ROLE_NOT_PERMITTED_AT_LEVEL,
          'Only the City Director may change the catastrophe level.',
          { role: user.role },
        ),
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await lockCityState(tx);
      const state = await tx.cityState.findUniqueOrThrow({ where: { id: 'singleton' } });
      const previousLevel = state.catastropheLevel;

      if (previousLevel === dto.level) {
        return { changed: false as const, previousLevel, newLevel: dto.level };
      }

      await tx.cityState.update({
        where: { id: 'singleton' },
        data: { catastropheLevel: dto.level },
      });

      await tx.catastropheLevelChange.create({
        data: {
          previousLevel,
          newLevel: dto.level,
          reason: dto.reason ?? null,
          changedById: user.id,
        },
      });

      // Coming down from 5 cancels the lowered threshold. It was an emergency
      // measure, not a permanent discount.
      if (previousLevel === 5 && dto.level < 5) {
        await tx.retentionOverride.updateMany({
          where: { active: true },
          data: { active: false, revokedAt: new Date() },
        });
      }

      await this.audit.allowed(
        user.id,
        'CATASTROPHE_LEVEL_SET',
        { previousLevel, newLevel: dto.level },
        tx,
      );

      return { changed: true as const, previousLevel, newLevel: dto.level };
    });

    if (result.changed) {
      const meta = CATASTROPHE_LEVELS.find((entry) => entry.level === result.newLevel);
      this.events.emitCatastropheLevelChanged({
        previousLevel: result.previousLevel,
        newLevel: result.newLevel,
        name: meta?.name ?? 'Unknown',
        direction: result.newLevel > result.previousLevel ? 'ESCALATION' : 'DE_ESCALATION',
        changedBy: user.displayName,
        changedAt: new Date().toISOString(),
      });
    }

    return this.current(user);
  }

  async lowerRetention(user: AuthenticatedUser, dto: LowerRetentionDto) {
    const [matrix, level] = await Promise.all([
      this.context.getPermissionMatrix(),
      this.context.getCatastropheLevel(),
    ]);

    const decision = evaluateRetentionOverride(
      matrix,
      toActor(user),
      level as CatastropheLevel,
      dto.pct,
      this.context.loweredRetentionPct,
    );

    if (!decision.ok) {
      await this.audit.rejected(user.id, 'RETENTION_LOWER', decision.violation, { pct: dto.pct });
      throw new RuleViolationException(decision.violation);
    }

    let districtId: string | null = null;
    if (dto.districtCode) {
      const district = await this.prisma.district.findUnique({ where: { code: dto.districtCode } });
      if (!district) {
        throw new NotFoundException({
          code: 'UNKNOWN_DISTRICT',
          message: `Unknown quarter ${dto.districtCode}.`,
        });
      }
      districtId = district.id;
    }

    const override = await this.prisma.retentionOverride.create({
      data: {
        districtId,
        pct: decision.value.pct,
        reason: dto.reason ?? null,
        createdById: user.id,
      },
    });

    await this.audit.allowed(user.id, 'RETENTION_LOWER', {
      overrideId: override.id,
      pct: decision.value.pct,
      districtCode: dto.districtCode ?? null,
    });

    this.events.emitRetentionThresholdChanged({
      districtCode: (dto.districtCode as DistrictCode) ?? null,
      pct: decision.value.pct,
      changedBy: user.displayName,
    });

    return override;
  }

  history() {
    return this.prisma.catastropheLevelChange.findMany({
      include: { changedBy: { select: { displayName: true, role: true } } },
      orderBy: { changedAt: 'desc' },
      take: 50,
    });
  }
}
