import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@barberflow/db';
import { DateTime } from 'luxon';
import { ErrorCodes, exceedsPlan, monthlyPrice, UpdateBusinessInput } from '@barberflow/shared';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { uniqueSlug } from './slugs';
import { isSubscriptionUsable } from '../booking/booking.service';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(userId: string, input: { name: string; slug?: string }, ip: string | null) {
    const slug = input.slug
      ? input.slug
      : await uniqueSlug(input.name, async (s) => (await this.prisma.business.count({ where: { slug: s } })) > 0);
    if (input.slug && (await this.prisma.business.count({ where: { slug } }))) {
      throw new AppError(HttpStatus.CONFLICT, ErrorCodes.SLUG_TAKEN, 'Slug taken');
    }
    const plan = await this.prisma.subscriptionPlan.findFirst({ where: { code: 'SOLO', isActive: true } })
      ?? await this.prisma.subscriptionPlan.findFirst({ where: { isActive: true }, orderBy: { priceUzs: 'asc' } });
    return this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: input.name,
          slug,
          onboardingStep: 3,
          cancellationPolicy: null,
          members: { create: { userId, role: 'OWNER' } },
        },
      });
      if (plan) {
        // Trial only. A paid period starts exclusively after an admin confirms a recorded payment.
        await tx.subscription.create({
          data: {
            businessId: business.id,
            planId: plan.id,
            status: 'TRIALING',
            seats: 1,
            trialEndsAt: new Date(Date.now() + plan.trialDays * 86400_000),
          },
        });
      }
      await this.audit.log({ actorUserId: userId, businessId: business.id, action: 'business.create', entityType: 'business', entityId: business.id, ip }, tx);
      return business;
    });
  }

  async get(businessId: string) {
    const b = await this.prisma.business.findUnique({ where: { id: businessId }, include: { subscription: { include: { plan: true } } } });
    if (!b) throw notFound('Business');
    return { ...b, acceptingBookings: b.status === 'ACTIVE' && isSubscriptionUsable(b.subscription) };
  }

  async update(businessId: string, input: UpdateBusinessInput, actorUserId: string, ip: string | null) {
    const b = await this.prisma.business.update({ where: { id: businessId }, data: input });
    await this.audit.log({ actorUserId, businessId, action: 'business.update', entityType: 'business', entityId: businessId, data: Object.keys(input), ip });
    return b;
  }

  async updateSlug(businessId: string, slug: string, actorUserId: string, ip: string | null) {
    const taken = await this.prisma.business.findFirst({ where: { slug, NOT: { id: businessId } } });
    if (taken) throw new AppError(HttpStatus.CONFLICT, ErrorCodes.SLUG_TAKEN, 'Slug taken');
    await this.audit.log({ actorUserId, businessId, action: 'business.slug', data: { slug }, ip });
    return this.prisma.business.update({ where: { id: businessId }, data: { slug } });
  }

  /** Real numbers only. "priceValue" is the list-price sum of completed visits, NOT revenue. */
  async dashboard(businessId: string, barberId: string | null) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const now = DateTime.now().setZone(b.timezone);
    const dayStart = now.startOf('day').toUTC().toJSDate();
    const dayEnd = now.endOf('day').toUTC().toJSDate();
    const weekStart = now.minus({ days: 6 }).startOf('day').toUTC().toJSDate();
    const scope: Prisma.AppointmentWhereInput = { businessId, ...(barberId ? { barberId } : {}) };
    const [today, week, completed, cancelled, noShow, activeBarbers, priceAgg, upcoming] = await Promise.all([
      this.prisma.appointment.count({ where: { ...scope, startsAt: { gte: dayStart, lte: dayEnd }, status: { not: 'CANCELLED' } } }),
      this.prisma.appointment.count({ where: { ...scope, startsAt: { gte: weekStart, lte: dayEnd }, status: { not: 'CANCELLED' } } }),
      this.prisma.appointment.count({ where: { ...scope, startsAt: { gte: weekStart, lte: dayEnd }, status: 'COMPLETED' } }),
      this.prisma.appointment.count({ where: { ...scope, startsAt: { gte: weekStart, lte: dayEnd }, status: 'CANCELLED' } }),
      this.prisma.appointment.count({ where: { ...scope, startsAt: { gte: weekStart, lte: dayEnd }, status: 'NO_SHOW' } }),
      this.prisma.barber.count({ where: { businessId, isActive: true } }),
      this.prisma.appointment.aggregate({ where: { ...scope, startsAt: { gte: weekStart, lte: dayEnd }, status: 'COMPLETED' }, _sum: { priceUzs: true } }),
      this.prisma.appointment.findMany({
        where: { ...scope, status: 'CONFIRMED', startsAt: { gte: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 6,
        include: { barber: { select: { name: true } }, customer: { select: { name: true } } },
      }),
    ]);
    return {
      todayCount: today,
      weekCount: week,
      completed,
      cancelled,
      noShow,
      activeBarbers,
      completedPriceValueUzs: priceAgg._sum.priceUzs ?? 0,
      upcoming: upcoming.map((a) => ({
        id: a.id, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), serviceName: a.serviceName,
        barberName: a.barber.name, customerName: a.customer.name, priceUzs: a.priceUzs,
      })),
    };
  }

  async subscription(businessId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { businessId }, include: { plan: true, payments: { orderBy: { createdAt: 'desc' } } } });
    const activeBarbers = await this.prisma.barber.count({ where: { businessId, isActive: true } });
    const plans = await this.prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { priceUzs: 'desc' } });
    return {
      subscription: sub && {
        id: sub.id, status: sub.status, seats: sub.seats, trialEndsAt: sub.trialEndsAt, currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd, usable: isSubscriptionUsable(sub),
        plan: { id: sub.plan.id, code: sub.plan.code, name: sub.plan.name, pricing: sub.plan.pricing, priceUzs: sub.plan.priceUzs, minSeats: sub.plan.minSeats, maxSeats: sub.plan.maxSeats },
        monthlyPriceUzs: monthlyPrice(sub.plan, activeBarbers),
        payments: sub.payments.map((p) => ({ id: p.id, amountUzs: p.amountUzs, periodMonths: p.periodMonths, method: p.method, status: p.status, createdAt: p.createdAt, confirmedAt: p.confirmedAt })),
      },
      activeBarbers,
      plans: plans.map((p) => ({ id: p.id, code: p.code, name: p.name, pricing: p.pricing, priceUzs: p.priceUzs, minSeats: p.minSeats, maxSeats: p.maxSeats, description: p.description, monthlyPriceUzs: monthlyPrice(p, activeBarbers) })),
    };
  }

  /** SOLO allows one active barber; enforced when activating/adding barbers. */
  async assertSeatAvailable(businessId: string, tx: Prisma.TransactionClient = this.prisma) {
    const sub = await tx.subscription.findUnique({ where: { businessId }, include: { plan: true } });
    if (!sub) return;
    const active = await tx.barber.count({ where: { businessId, isActive: true } });
    if (exceedsPlan(sub.plan, active + 1)) {
      throw new AppError(HttpStatus.CONFLICT, ErrorCodes.PLAN_LIMIT, 'Plan seat limit reached');
    }
  }
}
