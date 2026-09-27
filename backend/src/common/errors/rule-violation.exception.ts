import { HttpException } from '@nestjs/common';
import { RuleResult, RuleViolation } from '../../domain';

export class RuleViolationException extends HttpException {
  constructor(public readonly violation: RuleViolation) {
    super(
      {
        statusCode: violation.httpStatus,
        code: violation.code,
        message: violation.message,
        details: violation.details ?? null,
      },
      violation.httpStatus,
    );
  }
}

export function unwrap<T>(result: RuleResult<T>): T {
  if (result.ok) return result.value;
  throw new RuleViolationException(result.violation);
}
