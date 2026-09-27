import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RuleViolationException } from './rule-violation.exception';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details: unknown;
  path: string;
  timestamp: string;
}

const FALLBACK_CODES: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

@Catch()
// Every response has the same shape and every refusal carries a distinct code,
// so a client can tell WHICH rule said no without parsing prose.
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toBody(exception, request.url);

    if (body.statusCode >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${body.code}`, exception as Error);
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${body.statusCode} ${body.code}`);
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, path: string): ErrorBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof RuleViolationException) {
      const v = exception.violation;
      return {
        statusCode: v.httpStatus,
        code: v.code,
        message: v.message,
        details: v.details ?? null,
        path,
        timestamp,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        const message = Array.isArray(obj.message)
          ? (obj.message as string[]).join('; ')
          : typeof obj.message === 'string'
            ? obj.message
            : exception.message;
        return {
          statusCode: status,
          code: typeof obj.code === 'string' ? obj.code : (FALLBACK_CODES[status] ?? 'ERROR'),
          message,
          details: Array.isArray(obj.message) ? { issues: obj.message } : (obj.details ?? null),
          path,
          timestamp,
        };
      }

      return {
        statusCode: status,
        code: FALLBACK_CODES[status] ?? 'ERROR',
        message: String(res),
        details: null,
        path,
        timestamp,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error.',
      details: null,
      path,
      timestamp,
    };
  }
}
