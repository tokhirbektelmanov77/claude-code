import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, AppointmentSource, AppointmentStatus } from '@barberflow/db';
import { checkSlot, ErrorCodes, SlotRejection } from '@barberflow/shared';
import { AppError, conflict, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { newToken, sha256 } from '../auth/crypto';
import { AvailabilityService } from './availability.service';

type Tx = Prisma.TransactionClient;

export type CustomerSpec =
  | { kind: 'guest'; name: string; phone: string }
  | { kind: 'existing'; customerId: string }
  | { kind: 'new'; name: string; phone: string | null };

export interface CreateAppointmentParams {
  barberId: string;
  serviceId: string;
  startsAt: Date;
  customer: CustomerSpec;
  source: AppointmentSource;
  /** null for guest (online) bookings: clients have no accounts. */
  actorUserId: string | null;
  note?: string | null;
  /** Client-supplied key; a retried request with the same key returns the original appointment. */
  idempotencyKey?: string | null;
  /** Staff bookings ignore lead time and horizon, never conflicts or working hours. */
  staff: boolean;
  /** When set, the barber must belong to this business (staff endpoints). */
  businessId?: string;
  consent?: boolean;
}

/** Max simultaneously active future bookings one phone may hold per business (guest spam guard). */
export const GUEST_ACTIVE_BOOKINGS_LIMIT = 3;

export const APPOINTMENT_INCLUDE = {
  barber: { select: { id: true, name: true, slug: true, photoUrl: true, userId: true } },
  customer: { select: { id: true, name: true, phone: true, userId: true } },
  business: {
    select: {
      id: true, name: true, slug: true, address: true, city: true, latitude: true, longitude: true, timezone: true,
      cancellationMinHours: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

export type AppointmentWithRefs = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

function isOverlapViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { meta?: { code?: string } })?.meta?.code;
  return code === '23P01' || msg.includes('23P01') || msg.includes('appointment_no_overlap');
}

function isUniqueViolation(e: unknown, field: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  const target = (e.meta?.target as string[] | string | undefined) ?? [];
  return Array.isArray(target) ? target.some((t) => t.includes(field)) : String(target).includes(field);
}

function rejection(reason: SlotRejection): AppError {
  if (reason === 'CONFLICT') return conflict(ErrorCodes.SLOT_TAKEN, 'This time is already booked');
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCodes.SLOT_UNAVAILABLE, 'Slot is not available', { reason });
}

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

  /**
   * Serialises all booking writes for one barber: concurrent requests for the same barber queue on
   * this row lock and then re-read the calendar. The exclusion constraint remains the final guard.
   */
  private async lockBarber(tx: Tx, barberId: string) {
    await tx.$queryRaw`SELECT id FROM barbers WHERE id = ${barberId}::uuid FOR UPDATE`;
  }

  /** Idempotency keys are scoped to the staff user, or to the guest's phone. */
  private scopedKey(p: CreateAppointmentParams) {
    if (!p.idempotencyKey) return null;
    const scope = p.actorUserId ?? (p.customer.kind === 'guest' ? `guest:${p.customer.phone}` : 'anon');
    return `${scope}:${p.idempotencyKey}`.slice(0, 200);
  }

  /**
   * A replayed guest request gets a fresh manage token (only the hash is stored, so the original
   * cannot be returned). Only the holder of the random idempotency key can trigger this.
   */
  private async replay(existing: AppointmentWithRefs, guest: boolean, db: Tx = this.prisma) {
    if (!guest) return { appointment: existing, replayed: true };
    const manageToken = newToken();
    await db.appointment.update({ where: { id: existing.id }, data: { manageTokenHash: sha256(manageToken) } });
    return { appointment: existing, replayed: true, manageToken };
  }

  async create(p: CreateAppointmentParams): Promise<{ appointment: AppointmentWithRefs; replayed: boolean; manageToken?: string }> {
    const key = this.scopedKey(p);
    const guest = p.customer.kind === 'guest';
    if (key) {
      const existing = await this.prisma.appointment.findUnique({ where: { idempotencyKey: key }, include: APPOINTMENT_INCLUDE });
      if (existing) return this.replay(existing, guest);
    }

    const barber = await this.availability.getBarberWithBusiness(p.barberId);
    if (p.businessId && barber.businessId !== p.businessId) throw notFound('Barber');
    if (!p.staff) await this.assertAcceptingOnlineBookings(barber.businessId);
    if (barber.business.status === 'BLOCKED') throw forbidden('Business is blocked');
    if (!barber.isActive) throw notFound('Barber');
    const service = await this.availability.effectiveService(p.barberId, p.serviceId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockBarber(tx, p.barberId);
        // A concurrent retry with the same key may have committed while we waited for the lock.
        if (key) {
          const dup = await tx.appointment.findUnique({ where: { idempotencyKey: key }, include: APPOINTMENT_INCLUDE });
          if (dup) return this.replay(dup, guest, tx);
        }
        if (p.customer.kind === 'guest') {
          const active = await tx.appointment.count({
            where: { businessId: barber.businessId, status: 'CONFIRMED', startsAt: { gt: new Date() }, customer: { phone: p.customer.phone } },
          });
          if (active >= GUEST_ACTIVE_BOOKINGS_LIMIT) {
            throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.TOO_MANY_BOOKINGS, 'Too many active bookings for this phone');
          }
        }
        const manageToken = guest ? newToken() : undefined;
        const end = new Date(p.startsAt.getTime() + service.durationMin * 60_000);
        const blockedUntil = new Date(end.getTime() + service.bufferAfterMin * 60_000);
        const ctx = await this.availability.buildContext(p.barberId, { from: new Date(p.startsAt.getTime() - 86400_000), to: new Date(blockedUntil.getTime() + 86400_000) }, {}, tx);
        const reason = checkSlot(p.startsAt, service, ctx, { ignoreHorizon: p.staff, ignoreLeadTime: p.staff });
        if (reason) throw rejection(reason);

        const customerId = await this.resolveCustomer(tx, barber.businessId, p.customer, p.consent ?? false);
        const created = await tx.appointment.create({
          data: {
            businessId: barber.businessId,
            branchId: barber.branchId,
            barberId: p.barberId,
            serviceId: service.id,
            customerId,
            startsAt: p.startsAt,
            endsAt: end,
            blockedUntil,
            status: 'CONFIRMED',
            source: p.source,
            priceUzs: service.priceUzs,
            durationMin: service.durationMin,
            bufferAfterMin: service.bufferAfterMin,
            serviceName: service.name,
            customerNote: p.note ?? null,
            idempotencyKey: key,
            manageTokenHash: manageToken ? sha256(manageToken) : null,
            createdByUserId: p.actorUserId,
          },
          include: APPOINTMENT_INCLUDE,
        });
        await tx.appointmentEvent.create({
          data: {
            appointmentId: created.id,
            businessId: created.businessId,
            type: 'CREATED',
            actorUserId: p.actorUserId,
            data: { source: p.source, startsAt: created.startsAt.toISOString() },
          },
        });
        return { appointment: created, replayed: false, manageToken };
      });
    } catch (e) {
      if (key && isUniqueViolation(e, 'idempotency_key')) {
        const existing = await this.prisma.appointment.findUnique({ where: { idempotencyKey: key }, include: APPOINTMENT_INCLUDE });
        if (existing) return this.replay(existing, guest);
      }
      if (isOverlapViolation(e)) throw conflict(ErrorCodes.SLOT_TAKEN, 'This time is already booked');
      throw e;
    }
  }

  async reschedule(appointmentId: string, startsAt: Date, actorUserId: string | null, opts: { staff: boolean; businessId?: string }) {
    const current = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!current || (opts.businessId && current.businessId !== opts.businessId)) throw notFound('Appointment');
    if (current.status !== 'CONFIRMED') throw conflict(ErrorCodes.INVALID_STATE, 'Only confirmed appointments can be moved');

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockBarber(tx, current.barberId);
        const fresh = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
        if (fresh.status !== 'CONFIRMED') throw conflict(ErrorCodes.INVALID_STATE, 'Only confirmed appointments can be moved');
        // Duration and price stay as booked (snapshot); only the time moves.
        const request = { durationMin: fresh.durationMin, bufferAfterMin: fresh.bufferAfterMin };
        const end = new Date(startsAt.getTime() + fresh.durationMin * 60_000);
        const blockedUntil = new Date(end.getTime() + fresh.bufferAfterMin * 60_000);
        const ctx = await this.availability.buildContext(
          fresh.barberId,
          { from: new Date(startsAt.getTime() - 86400_000), to: new Date(blockedUntil.getTime() + 86400_000) },
          { excludeAppointmentId: fresh.id },
          tx,
        );
        const reason = checkSlot(startsAt, request, ctx, { ignoreHorizon: opts.staff, ignoreLeadTime: opts.staff });
        if (reason) throw rejection(reason);
        const updated = await tx.appointment.update({
          where: { id: fresh.id },
          data: { startsAt, endsAt: end, blockedUntil },
          include: APPOINTMENT_INCLUDE,
        });
        await tx.appointmentEvent.create({
          data: {
            appointmentId: fresh.id,
            businessId: fresh.businessId,
            type: 'RESCHEDULED',
            actorUserId,
            data: { from: fresh.startsAt.toISOString(), to: startsAt.toISOString() },
          },
        });
        return updated;
      });
    } catch (e) {
      if (isOverlapViolation(e)) throw conflict(ErrorCodes.SLOT_TAKEN, 'This time is already booked');
      throw e;
    }
  }

  async cancel(appointmentId: string, actorUserId: string | null, reason: string | null, opts: { businessId?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!appt || (opts.businessId && appt.businessId !== opts.businessId)) throw notFound('Appointment');
      // Conditional update: two parallel cancels cannot both succeed.
      const res = await tx.appointment.updateMany({
        where: { id: appt.id, status: 'CONFIRMED' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
      });
      if (res.count === 0) throw conflict(ErrorCodes.INVALID_STATE, 'Appointment is not active');
      const updated = await tx.appointment.findUniqueOrThrow({ where: { id: appt.id }, include: APPOINTMENT_INCLUDE });
      await tx.appointmentEvent.create({
        data: { appointmentId: appt.id, businessId: appt.businessId, type: 'CANCELLED', actorUserId, data: { reason } },
      });
      return updated;
    });
  }

  async setOutcome(appointmentId: string, status: Extract<AppointmentStatus, 'COMPLETED' | 'NO_SHOW'>, actorUserId: string, businessId: string) {
    return this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!appt || appt.businessId !== businessId) throw notFound('Appointment');
      if (appt.startsAt.getTime() > Date.now()) {
        throw conflict(ErrorCodes.INVALID_STATE, 'Visit has not started yet');
      }
      const res = await tx.appointment.updateMany({
        where: { id: appt.id, status: 'CONFIRMED' },
        data: { status, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) },
      });
      if (res.count === 0) throw conflict(ErrorCodes.INVALID_STATE, 'Appointment is not active');
      await tx.appointmentEvent.create({ data: { appointmentId: appt.id, businessId, type: status, actorUserId } });
      return tx.appointment.findUniqueOrThrow({ where: { id: appt.id }, include: APPOINTMENT_INCLUDE });
    });
  }

  /** Online booking is allowed while the business is active and its subscription is trialing/active. */
  async assertAcceptingOnlineBookings(businessId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId }, include: { subscription: true } });
    if (!business) throw notFound('Business');
    if (business.status === 'BLOCKED') throw new AppError(HttpStatus.FORBIDDEN, ErrorCodes.BUSINESS_BLOCKED, 'Business is blocked');
    if (!isSubscriptionUsable(business.subscription)) {
      throw new AppError(HttpStatus.FORBIDDEN, ErrorCodes.BOOKING_DISABLED, 'Online booking is disabled');
    }
  }

  private async resolveCustomer(tx: Tx, businessId: string, spec: CustomerSpec, consent: boolean): Promise<string> {
    const consentAt = consent ? new Date() : undefined;
    if (spec.kind === 'existing') {
      const c = await tx.customer.findFirst({ where: { id: spec.customerId, businessId, anonymizedAt: null } });
      if (!c) throw notFound('Customer');
      return c.id;
    }
    if (spec.kind === 'guest') {
      // Same phone = same client card in this business (history, notes). The latest name wins.
      const c = await tx.customer.upsert({
        where: { businessId_phone: { businessId, phone: spec.phone } },
        update: { name: spec.name, anonymizedAt: null, ...(consentAt ? { consentAt } : {}) },
        create: { businessId, name: spec.name, phone: spec.phone, consentAt },
      });
      return c.id;
    }
    // Staff-entered walk-in: reuse the client card by phone when given.
    if (spec.phone) {
      const c = await tx.customer.upsert({
        where: { businessId_phone: { businessId, phone: spec.phone } },
        update: {},
        create: { businessId, name: spec.name, phone: spec.phone },
      });
      return c.id;
    }
    const c = await tx.customer.create({ data: { businessId, name: spec.name } });
    return c.id;
  }
}

export function isSubscriptionUsable(sub: { status: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null } | null): boolean {
  if (!sub) return false;
  const now = Date.now();
  if (sub.status === 'TRIALING') return !sub.trialEndsAt || sub.trialEndsAt.getTime() > now;
  if (sub.status === 'ACTIVE') return !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > now;
  // PAST_DUE keeps a grace period: bookings continue until the admin expires it.
  return sub.status === 'PAST_DUE';
}

export function toAppointmentDto(a: AppointmentWithRefs, opts: { includeCustomerPhone: boolean } = { includeCustomerPhone: true }) {
  return {
    id: a.id,
    businessId: a.businessId,
    barberId: a.barberId,
    serviceId: a.serviceId,
    customerId: a.customerId,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    blockedUntil: a.blockedUntil.toISOString(),
    status: a.status,
    source: a.source,
    priceUzs: a.priceUzs,
    durationMin: a.durationMin,
    serviceName: a.serviceName,
    customerNote: a.customerNote,
    cancelReason: a.cancelReason,
    barber: { id: a.barber.id, name: a.barber.name, slug: a.barber.slug, photoUrl: a.barber.photoUrl },
    customer: { id: a.customer.id, name: a.customer.name, phone: opts.includeCustomerPhone ? a.customer.phone : null },
    business: a.business,
  };
}
