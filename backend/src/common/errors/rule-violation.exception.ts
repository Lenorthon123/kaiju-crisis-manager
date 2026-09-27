import { HttpException } from '@nestjs/common';
import { RuleViolation } from '../../domain';

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
