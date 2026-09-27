import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, PrismaTransaction } from '../prisma/prisma.service';
import { RuleViolation } from '../domain';

@Injectable()
// Every attempt, allowed or refused, with the code of the rule that refused it.
// This is how the platform can prove after the fact that each rejection was
// distinct and motivated.
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async allowed(
    userId: string | null,
    action: string,
    context: Record<string, unknown>,
    tx?: PrismaTransaction,
  ): Promise<void> {
    await this.write({ userId, action, outcome: 'ALLOWED', context }, tx);
  }

  async rejected(
    userId: string | null,
    action: string,
    violation: RuleViolation,
    context: Record<string, unknown> = {},
    tx?: PrismaTransaction,
  ): Promise<void> {
    await this.write(
      {
        userId,
        action,
        outcome: 'REJECTED',
        violationCode: violation.code,
        httpStatus: violation.httpStatus,
        context: { ...context, details: violation.details ?? null },
      },
      tx,
    );
  }

  private async write(
    data: {
      userId: string | null;
      action: string;
      outcome: 'ALLOWED' | 'REJECTED';
      violationCode?: string;
      httpStatus?: number;
      context: Record<string, unknown>;
    },
    tx?: PrismaTransaction,
  ): Promise<void> {
    try {
      const client = tx ?? this.prisma;
      await client.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          outcome: data.outcome,
          violationCode: data.violationCode ?? null,
          httpStatus: data.httpStatus ?? null,
          context: data.context as never,
        },
      });
    } catch (error) {
      this.logger.error('Failed to write audit entry', error as Error);
    }
  }
}
