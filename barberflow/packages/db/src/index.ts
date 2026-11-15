import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

/** Creates a PrismaClient. Callers own its lifecycle (call $disconnect on shutdown). */
export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

/** Postgres SQLSTATE raised by the appointment exclusion constraint. */
export const PG_EXCLUSION_VIOLATION = '23P01';
export const APPOINTMENT_OVERLAP_CONSTRAINT = 'appointment_no_overlap';

export { hashPassword, verifyPassword, temporaryPassword } from './password';
