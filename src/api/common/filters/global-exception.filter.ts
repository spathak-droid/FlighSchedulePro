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
        this.logger.error(`Exception name: ${exception.constructor.name}, message: "${exception.message}"`);
        if ('cause' in exception) this.logger.error(`Cause: ${String(exception.cause)}`);
      }

      body = {
        error: 'INTERNAL_ERROR',
        message:
          process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : errorMessage,
        correlationId: getCorrelationId(),
      };
    }

    void reply.status(status).send(body);
  }
}
