import { Injectable } from '@nestjs/common';
import { Prisma } from '@barberflow/db';
import { PrismaService } from './prisma.service';

export interface AuditEntry {
  actorUserId?: string | null;
  businessId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  data?: Prisma.InputJsonValue;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma) {
    return tx.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        businessId: entry.businessId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        data: entry.data,
        ip: entry.ip ?? null,
      },
    });
  }
}
