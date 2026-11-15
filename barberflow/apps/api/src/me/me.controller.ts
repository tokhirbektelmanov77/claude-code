import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { DateTime } from 'luxon';
import {
  cancelSchema, createBookingSchema, ErrorCodes, isoDate, rescheduleSchema, updateProfileSchema,
} from '@barberflow/shared';
import { z } from 'zod';
import { Authenticated, CurrentAuth, ReqIp } from '../common/decorators';
import type { AuthContext } from '../common/request-context';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { APPOINTMENT_INCLUDE, BookingService, toAppointmentDto } from '../booking/booking.service';
import { AvailabilityService } from '../booking/availability.service';
import { AuthService } from '../auth/auth.service';
import { newToken, sha256 } from '../auth/crypto';
import { APP_CONFIG, AppConfig } from '../config';

class CreateBookingDto extends createZodDto(createBookingSchema) {}
class RescheduleDto extends createZodDto(rescheduleSchema) {}
class CancelDto extends createZodDto(cancelSchema) {}
class ProfileDto extends createZodDto(updateProfileSchema) {}
class DateQuery extends createZodDto(z.object({ date: isoDate })) {}

@ApiTags('client')
@Controller()
@Authenticated()
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly booking: BookingService,
    private readonly availability: AvailabilityService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Online booking by the signed-in client. Send an Idempotency-Key header to make retries safe. */
  @Post('bookings')
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  async book(@CurrentAuth() auth: AuthContext, @Body() body: CreateBookingDto, @Headers('idempotency-key') idem?: string) {
    if (!auth.user.name || auth.user.name !== body.customerName) {
      await this.prisma.user.update({ where: { id: auth.user.id }, data: { name: body.customerName } });
    }
    const { appointment, replayed } = await this.booking.create({
      barberId: body.barberId,
      serviceId: body.serviceId,
      startsAt: new Date(body.startsAt),
      customer: { kind: 'user', userId: auth.user.id, name: body.customerName, phone: auth.user.phone },
      source: auth.user.telegramId && !auth.user.phone ? 'TELEGRAM' : 'ONLINE',
      actorUserId: auth.user.id,
      note: body.note,
      idempotencyKey: idem?.slice(0, 100) ?? null,
      staff: false,
      consent: body.consent,
    });
    return { ...toAppointmentDto(appointment), replayed };
  }

  @Get('me/appointments')
  async list(@CurrentAuth() auth: AuthContext) {
    const items = await this.prisma.appointment.findMany({
      where: { customer: { userId: auth.user.id } },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: 'desc' },
      take: 200,
    });
    return items.map((a) => toAppointmentDto(a));
  }

  private async ownAppointment(auth: AuthContext, id: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id, customer: { userId: auth.user.id } }, include: APPOINTMENT_INCLUDE });
    if (!a) throw notFound('Appointment');
    return a;
  }

  private assertChangeAllowed(a: { startsAt: Date; business: { cancellationMinHours: number } }) {
    if (a.startsAt.getTime() - Date.now() < a.business.cancellationMinHours * 3600_000) {
      throw new AppError(409, ErrorCodes.CANCEL_TOO_LATE, 'Too late to change this appointment', { hours: a.business.cancellationMinHours });
    }
  }

  @Get('me/appointments/:id')
  async one(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return toAppointmentDto(await this.ownAppointment(auth, id));
  }

  @Post('me/appointments/:id/cancel')
  @HttpCode(200)
  async cancel(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: CancelDto) {
    const a = await this.ownAppointment(auth, id);
    this.assertChangeAllowed(a);
    return toAppointmentDto(await this.booking.cancel(a.id, auth.user.id, body.reason ?? null, {}));
  }

  @Get('me/appointments/:id/dates')
  async rescheduleDates(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    const a = await this.ownAppointment(auth, id);
    return { dates: await this.availability.availableDates(a.barberId, a.serviceId, { excludeAppointmentId: a.id }) };
  }

  @Get('me/appointments/:id/slots')
  async rescheduleSlots(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: DateQuery) {
    const a = await this.ownAppointment(auth, id);
    return { date: q.date, slots: await this.availability.slotsForDate(a.barberId, a.serviceId, q.date, { excludeAppointmentId: a.id }) };
  }

  @Post('me/appointments/:id/reschedule')
  @HttpCode(200)
  async reschedule(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: RescheduleDto) {
    const a = await this.ownAppointment(auth, id);
    this.assertChangeAllowed(a);
    return toAppointmentDto(await this.booking.reschedule(a.id, new Date(body.startsAt), auth.user.id, { staff: false }));
  }

  @Patch('me')
  async update(@CurrentAuth() auth: AuthContext, @Body() body: ProfileDto) {
    const user = await this.prisma.user.update({ where: { id: auth.user.id }, data: body });
    return this.auth.me(user);
  }

  @Post('me/invitations/:id/accept')
  @HttpCode(200)
  async acceptInvite(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @ReqIp() ip: string | null) {
    const inv = await this.prisma.invitation.findFirst({
      where: { id, phone: auth.user.phone ?? '__none__', acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!inv) throw notFound('Invitation');
    await this.prisma.$transaction(async (tx) => {
      await tx.businessMember.upsert({
        where: { businessId_userId: { businessId: inv.businessId, userId: auth.user.id } },
        update: { role: inv.role, status: 'ACTIVE' },
        create: { businessId: inv.businessId, userId: auth.user.id, role: inv.role },
      });
      if (inv.barberId) {
        await tx.barber.updateMany({ where: { id: inv.barberId, businessId: inv.businessId, userId: null }, data: { userId: auth.user.id } });
      }
      await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
      await this.audit.log({ actorUserId: auth.user.id, businessId: inv.businessId, action: 'member.invitation.accept', entityType: 'invitation', entityId: inv.id, ip }, tx);
    });
    return this.auth.me(auth.user);
  }

  /** Creates a one-time deep link t.me/<bot>?start=link_<token> to bind the Telegram chat. */
  @Post('me/telegram/link')
  @HttpCode(200)
  async telegramLink(@CurrentAuth() auth: AuthContext) {
    if (!this.config.TELEGRAM_BOT_TOKEN || !this.config.TELEGRAM_BOT_USERNAME) {
      return { configured: false, url: null };
    }
    const token = newToken(18);
    await this.prisma.telegramLinkToken.create({
      data: { userId: auth.user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 15 * 60_000) },
    });
    return { configured: true, url: `https://t.me/${this.config.TELEGRAM_BOT_USERNAME}?start=link_${token}` };
  }

  /** Data portability: everything stored about the current user. */
  @Get('me/export')
  async export(@CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    const customers = await this.prisma.customer.findMany({
      where: { userId: auth.user.id },
      include: { business: { select: { name: true } }, appointments: { select: { startsAt: true, serviceName: true, priceUzs: true, status: true } } },
    });
    await this.audit.log({ actorUserId: auth.user.id, action: 'privacy.export', entityType: 'user', entityId: auth.user.id, ip });
    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id, phone: user.phone, name: user.name, locale: user.locale, telegramUsername: user.telegramUsername,
        createdAt: user.createdAt, privacyAcceptedAt: user.privacyAcceptedAt,
      },
      businesses: customers.map((c) => ({
        business: c.business.name, name: c.name, phone: c.phone, consentAt: c.consentAt,
        appointments: c.appointments.map((a) => ({ ...a, startsAt: DateTime.fromJSDate(a.startsAt).toISO() })),
      })),
    };
  }

  /** Right to erasure: cancels future visits, wipes PII, revokes sessions. History stays anonymised. */
  @Delete('me')
  async deleteAccount(@CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    const owner = await this.prisma.businessMember.count({ where: { userId: auth.user.id, role: 'OWNER', status: 'ACTIVE' } });
    if (owner > 0) throw new AppError(409, ErrorCodes.INVALID_STATE, 'Transfer or close your business before deleting the account');
    const future = await this.prisma.appointment.findMany({
      where: { customer: { userId: auth.user.id }, status: 'CONFIRMED', startsAt: { gt: new Date() } },
      select: { id: true },
    });
    for (const a of future) await this.booking.cancel(a.id, auth.user.id, 'account deleted', {});
    await this.prisma.$transaction(async (tx) => {
      await tx.customer.updateMany({
        where: { userId: auth.user.id },
        data: { name: '—', phone: null, notes: null, userId: null, anonymizedAt: new Date() },
      });
      await tx.businessMember.updateMany({ where: { userId: auth.user.id }, data: { status: 'DISABLED' } });
      await tx.session.updateMany({ where: { userId: auth.user.id }, data: { revokedAt: new Date() } });
      await tx.user.update({
        where: { id: auth.user.id },
        data: { phone: null, name: null, telegramId: null, telegramChatId: null, telegramUsername: null, deletedAt: new Date() },
      });
      await this.audit.log({ actorUserId: auth.user.id, action: 'privacy.delete_account', entityType: 'user', entityId: auth.user.id, ip }, tx);
    });
    return { ok: true };
  }
}
