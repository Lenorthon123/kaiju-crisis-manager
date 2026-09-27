import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActionKey, checkPermission } from '../../domain';
import { DomainContextService } from '../../domain-context/domain-context.service';
import { AuthenticatedUser, toActor } from '../../auth/authenticated-user';
import { REQUIRES_ACTION } from '../decorators/requires-action.decorator';
import { RuleViolationException } from '../errors/rule-violation.exception';

@Injectable()
// Server-side enforcement of the level x role matrix, read from the database
// on every request.
export class ActionPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: DomainContextService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<ActionKey | undefined>(REQUIRES_ACTION, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!action) return true;

    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    const [matrix, level] = await Promise.all([
      this.context.getPermissionMatrix(),
      this.context.getCatastropheLevel(),
    ]);

    const result = checkPermission(matrix, toActor(request.user), action, level);
    if (!result.ok) throw new RuleViolationException(result.violation);
    return true;
  }
}
