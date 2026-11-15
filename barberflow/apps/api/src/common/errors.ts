import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '@barberflow/shared';

export class AppError extends HttpException {
  constructor(status: number, public readonly code: string, message?: string, public readonly details?: unknown) {
    super({ statusCode: status, code, message: message ?? code, details }, status);
  }
}

export const notFound = (what = 'Resource') => new AppError(HttpStatus.NOT_FOUND, ErrorCodes.NOT_FOUND, `${what} not found`);
export const forbidden = (msg = 'Forbidden') => new AppError(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN, msg);
export const unauthorized = () => new AppError(HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHORIZED, 'Authentication required');
export const conflict = (code: string, msg?: string, details?: unknown) => new AppError(HttpStatus.CONFLICT, code, msg, details);
export const badRequest = (code: string, msg?: string, details?: unknown) => new AppError(HttpStatus.BAD_REQUEST, code, msg, details);
