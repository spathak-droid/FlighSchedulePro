import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getCorrelationId } from '../middleware/correlation-id.middleware.js';

interface ErrorResponseBody {
  error: string;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

/**
 * Maps HTTP status codes to structured error codes.
 */
const STATUS_TO_ERROR_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'SLOT_CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'FSP_UNAVAILABLE',
};

/**
 * Detect PostgreSQL / database errors by checking the error shape.
 * pg (node-postgres) errors carry `code`, `severity`, and `detail` properties.
 */
function isDatabaseError(
  err: unknown,
): err is Error & { code: string; detail?: string; constraint?: string; severity?: string } {
  if (!(err instanceof Error)) return false;
  const e = err as unknown as Record<string, unknown>;
  return typeof e.code === 'string' && typeof e.severity === 'string';
}

/**
 * Map well-known PostgreSQL error codes to HTTP status + error code.
 */
function mapDatabaseError(code: string): { status: number; error: string } {
  switch (code) {
    case '23505': // unique_violation
      return { status: HttpStatus.CONFLICT, error: 'DUPLICATE_ENTRY' };
    case '23503': // foreign_key_violation
      return { status: HttpStatus.BAD_REQUEST, error: 'FOREIGN_KEY_VIOLATION' };
    case '23502': // not_null_violation
      return { status: HttpStatus.BAD_REQUEST, error: 'MISSING_REQUIRED_FIELD' };
    case '23514': // check_violation
      return { status: HttpStatus.BAD_REQUEST, error: 'CHECK_VIOLATION' };
    case '08006': // connection_failure
    case '08001': // sqlclient_unable_to_establish_sqlconnection
    case '08004': // sqlserver_rejected_establishment_of_sqlconnection
    case '57P01': // admin_shutdown
    case '57P03': // cannot_connect_now
      return { status: HttpStatus.SERVICE_UNAVAILABLE, error: 'DATABASE_UNAVAILABLE' };
    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return { status: HttpStatus.CONFLICT, error: 'TRANSACTION_CONFLICT' };
    default:
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, error: 'DATABASE_ERROR' };
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status: number;
    let body: ErrorResponseBody;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // NestJS validation pipe and built-in exceptions can return
      // either a string or an object with { message, error, statusCode }.
      let message: string;
      let details: Record<string, unknown> | undefined;

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        // For validation errors, NestJS returns { message: string[] }
        if (Array.isArray(resp.message)) {
          message = (resp.message as string[]).join('; ');
          details = { validationErrors: resp.message };
        } else {
          message = (resp.message as string) ?? exception.message;
        }
      } else {
        message = exception.message;
      }

      const errorCode = STATUS_TO_ERROR_CODE[status] ?? 'HTTP_ERROR';

      body = {
        error: errorCode,
        message,
        correlationId: getCorrelationId(),
        ...(details ? { details } : {}),
      };
    } else if (isDatabaseError(exception)) {
      // Database-specific errors — map PostgreSQL error codes to HTTP responses
      const mapped = mapDatabaseError(exception.code);
      status = mapped.status;

      this.logger.error(
        `Database error on ${request.method} ${request.url}: [${exception.code}] ${exception.message}`,
        exception.stack,
      );

      const isProduction = process.env.NODE_ENV === 'production';
      const userMessage =
        status === HttpStatus.CONFLICT
          ? 'A record with this data already exists'
          : status === HttpStatus.SERVICE_UNAVAILABLE
            ? 'Database is temporarily unavailable. Please try again shortly.'
            : isProduction
              ? 'A database error occurred'
              : exception.message;

      body = {
        error: mapped.error,
        message: userMessage,
        correlationId: getCorrelationId(),
        ...(exception.constraint && !isProduction
          ? { details: { constraint: exception.constraint, pgCode: exception.code } }
          : {}),
      };
    } else if (exception instanceof TypeError) {
      // TypeErrors often indicate null/undefined access in code — always a 500
      status = HttpStatus.INTERNAL_SERVER_ERROR;

      this.logger.error(
        `TypeError on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );

      body = {
        error: 'INTERNAL_ERROR',
        message:
          process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : exception.message,
        correlationId: getCorrelationId(),
      };
    } else {
      // Unhandled / unknown errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;

      const errorMessage =
        exception instanceof Error ? exception.message : 'An unexpected error occurred';

      // Log the full error for debugging but return a generic message
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      if (exception instanceof Error) {
        this.logger.error(
          `Exception name: ${exception.constructor.name}, message: "${exception.message}"`,
        );
        if ('cause' in exception) this.logger.error(`Cause: ${String(exception.cause)}`);
      }

      body = {
        error: 'INTERNAL_ERROR',
        message:
          process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : errorMessage,
        correlationId: getCorrelationId(),
      };
    }

    // Guard against the reply already being sent (e.g., stream errors)
    if (reply.sent) {
      this.logger.warn(
        `Response already sent for ${request.method} ${request.url} — cannot send error response`,
      );
      return;
    }

    void reply.status(status).send(body);
  }
}
