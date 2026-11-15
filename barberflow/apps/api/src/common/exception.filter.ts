import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ZodValidationException } from 'nestjs-zod';
import type { Request, Response } from 'express';
import { ErrorCodes } from '@barberflow/shared';
import { PrismaService } from './prisma.service';

/**
 * Normalises every error to { statusCode, code, message, details? } and records unexpected (5xx)
 * failures in error_logs for the platform admin. Stack traces never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');
  constructor(private readonly prisma: PrismaService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof ZodValidationException) {
      const issues = exception.getZodError() as { issues?: { path: PropertyKey[]; message: string }[] };
      return res.status(400).json({
        statusCode: 400,
        code: ErrorCodes.VALIDATION,
        message: 'Validation failed',
        details: (issues.issues ?? []).map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
      });
    }
    if (exception instanceof ThrottlerException) {
      return res.status(429).json({ statusCode: 429, code: ErrorCodes.RATE_LIMITED, message: 'Too many requests' });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'code' in body) return res.status(status).json(body);
      const code =
        status === 404 ? ErrorCodes.NOT_FOUND : status === 403 ? ErrorCodes.FORBIDDEN : status === 401 ? ErrorCodes.UNAUTHORIZED : 'HTTP_' + status;
      const message = typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message);
      return res.status(status).json({ statusCode: status, code, message: String(message) });
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`${req.method} ${req.path}: ${err.message}`, err.stack);
    this.prisma.errorLog
      .create({
        data: {
          source: 'api',
          message: err.message.slice(0, 2000),
          stack: err.stack?.slice(0, 8000),
          // Path only: query strings and bodies may contain personal data.
          context: { method: req.method, path: req.route?.path ?? req.path },
        },
      })
      .catch(() => undefined);
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}
