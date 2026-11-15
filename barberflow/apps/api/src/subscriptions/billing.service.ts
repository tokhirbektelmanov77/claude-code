import { HttpStatus, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { ErrorCodes } from '@barberflow/shared';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';

@Injectable()
export class SubscriptionBillingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async recordPayment(
    businessId: string,
    input: { amountUzs: number; periodMonths: number; method: 'MANUAL' | 'BANK_TRANSFER' | 'CASH'; reference: string | null; note: string | null },
    actorUserId: string,
  ) {
    const sub = await this.prisma.subscription.findUnique({ where: { businessId } });
    if (!sub) throw notFound('Subscription');
    const payment = await this.prisma.payment.create({
      data: { businessId, subscriptionId: sub.id, ...input, status: 'PENDING', createdByUserId: actorUserId },
    });
    await this.audit.log({ actorUserId, businessId, action: 'payment.record', entityType: 'payment', entityId: payment.id, data: { amountUzs: input.amountUzs, months: input.periodMonths } });
    return payment;
  }

  /**
   * Activates/extends the paid period. Only a PENDING payment can be confirmed, exactly once.
   * The new period starts at the later of now and the current period end (no lost days).
   */
  async confirmPayment(paymentId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { subscription: true } });
      if (!p) throw notFound('Payment');
      const res = await tx.payment.updateMany({
        where: { id: p.id, status: 'PENDING' },
        data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedByUserId: actorUserId },
      });
      if (!res.count) throw new AppError(HttpStatus.CONFLICT, ErrorCodes.INVALID_STATE, 'Payment is not pending');
      const now = new Date();
      const sub = p.subscription;
      const start = sub.status === 'ACTIVE' && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      const end = DateTime.fromJSDate(start).plus({ months: p.periodMonths }).toJSDate();
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          currentPeriodStart: sub.status === 'ACTIVE' && sub.currentPeriodStart ? sub.currentPeriodStart : now,
          currentPeriodEnd: end,
        },
      });
      await tx.auditLog.create({
        data: { actorUserId, businessId: p.businessId, action: 'payment.confirm', entityType: 'payment', entityId: p.id, data: { periodEnd: end.toISOString() } },
      });
      return updated;
    });
  }

  async rejectPayment(paymentId: string, actorUserId: string, note?: string | null) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw notFound('Payment');
    const res = await this.prisma.payment.updateMany({ where: { id: p.id, status: 'PENDING' }, data: { status: 'REJECTED', note: note ?? p.note } });
    if (!res.count) throw new AppError(HttpStatus.CONFLICT, ErrorCodes.INVALID_STATE, 'Payment is not pending');
    await this.audit.log({ actorUserId, businessId: p.businessId, action: 'payment.reject', entityType: 'payment', entityId: p.id });
    return { ok: true };
  }

  async changePlan(businessId: string, planId: string, seats: number | undefined, actorUserId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw notFound('Plan');
    const sub = await this.prisma.subscription.findUnique({ where: { businessId } });
    if (!sub) throw notFound('Subscription');
    const activeBarbers = await this.prisma.barber.count({ where: { businessId, isActive: true } });
    if (plan.maxSeats !== null && activeBarbers > plan.maxSeats) {
      throw new AppError(HttpStatus.CONFLICT, ErrorCodes.PLAN_LIMIT, 'Too many active barbers for this plan');
    }
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { planId, seats: plan.pricing === 'FLAT' ? 1 : Math.max(plan.minSeats, seats ?? activeBarbers) },
    });
    await this.audit.log({ actorUserId, businessId, action: 'subscription.change_plan', entityType: 'subscription', entityId: sub.id, data: { planCode: plan.code } });
    return updated;
  }
}
