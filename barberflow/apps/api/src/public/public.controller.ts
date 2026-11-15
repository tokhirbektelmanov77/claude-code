import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  availabilityQuerySchema, availableDatesQuerySchema, cancelSchema, createBookingSchema, ErrorCodes, isoDate, rescheduleSchema,
} from '@barberflow/shared';
import { AvailabilityService } from '../booking/availability.service';
import { APPOINTMENT_INCLUDE, BookingService, toAppointmentDto } from '../booking/booking.service';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { sha256 } from '../auth/crypto';
import { PublicService } from './public.service';

class SlotsQuery extends createZodDto(availabilityQuerySchema) {}
class DatesQuery extends createZodDto(availableDatesQuerySchema) {}
class GuestBookingDto extends createZodDto(createBookingSchema) {}
class RescheduleDto extends createZodDto(rescheduleSchema) {}
class CancelDto extends createZodDto(cancelSchema) {}
class DateQuery extends createZodDto(z.object({ date: isoDate })) {}

/** base64url of 32 random bytes = 43 chars. Reject anything else before touching the DB. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly svc: PublicService,
    private readonly availability: AvailabilityService,
    private readonly booking: BookingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('businesses/:slug')
  business(@Param('slug') slug: string) {
    return this.svc.businessBySlug(slug.toLowerCase().slice(0, 60));
  }

  @Get('barbers/:slug')
  barber(@Param('slug') slug: string) {
    return this.svc.barberBySlug(slug.toLowerCase().slice(0, 60));
  }

  @Get('barbers/:barberId/dates')
  async dates(@Param('barberId', ParseUUIDPipe) barberId: string, @Query() q: DatesQuery) {
    return { dates: await this.availability.availableDates(barberId, q.serviceId) };
  }

  @Get('barbers/:barberId/slots')
  async slots(@Param('barberId', ParseUUIDPipe) barberId: string, @Query() q: SlotsQuery) {
    return { date: q.date, slots: await this.availability.slotsForDate(barberId, q.serviceId, q.date) };
  }

  @Get('plans')
  plans() {
    return this.svc.plans();
  }

  // ---------------- Guest booking (no account, no code) ----------------

  /**
   * Books with name + phone only. Returns `manageToken` once: the client keeps the link
   * /a/<token> to view, reschedule or cancel. Send an Idempotency-Key header to make retries safe.
   */
  @Post('bookings')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async book(@Body() body: GuestBookingDto, @Headers('idempotency-key') idem?: string) {
    const { appointment, replayed, manageToken } = await this.booking.create({
      barberId: body.barberId,
      serviceId: body.serviceId,
      startsAt: new Date(body.startsAt),
      customer: { kind: 'guest', name: body.customerName, phone: body.phone },
      source: 'ONLINE',
      actorUserId: null,
      note: body.note,
      idempotencyKey: idem?.slice(0, 100) ?? null,
      staff: false,
      consent: body.consent,
    });
    return { ...toAppointmentDto(appointment), manageToken, replayed };
  }

  private async byToken(token: string) {
    if (!TOKEN_RE.test(token)) throw notFound('Appointment');
    const a = await this.prisma.appointment.findUnique({ where: { manageTokenHash: sha256(token) }, include: APPOINTMENT_INCLUDE });
    if (!a) throw notFound('Appointment');
    return a;
  }

  private assertChangeAllowed(a: { startsAt: Date; business: { cancellationMinHours: number } }) {
    if (a.startsAt.getTime() - Date.now() < a.business.cancellationMinHours * 3600_000) {
      throw new AppError(HttpStatus.CONFLICT, ErrorCodes.CANCEL_TOO_LATE, 'Too late to change this appointment', { hours: a.business.cancellationMinHours });
    }
  }

  @Get('appointments/:token')
  @Throttle({ default: { limit: 120, ttl: 600_000 } })
  async appointment(@Param('token') token: string) {
    return toAppointmentDto(await this.byToken(token));
  }

  @Post('appointments/:token/cancel')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  async cancel(@Param('token') token: string, @Body() body: CancelDto) {
    const a = await this.byToken(token);
    this.assertChangeAllowed(a);
    return toAppointmentDto(await this.booking.cancel(a.id, null, body.reason ?? null, {}));
  }

  @Get('appointments/:token/dates')
  async rescheduleDates(@Param('token') token: string) {
    const a = await this.byToken(token);
    return { dates: await this.availability.availableDates(a.barberId, a.serviceId, { excludeAppointmentId: a.id }) };
  }

  @Get('appointments/:token/slots')
  async rescheduleSlots(@Param('token') token: string, @Query() q: DateQuery) {
    const a = await this.byToken(token);
    return { date: q.date, slots: await this.availability.slotsForDate(a.barberId, a.serviceId, q.date, { excludeAppointmentId: a.id }) };
  }

  @Post('appointments/:token/reschedule')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  async reschedule(@Param('token') token: string, @Body() body: RescheduleDto) {
    const a = await this.byToken(token);
    this.assertChangeAllowed(a);
    return toAppointmentDto(await this.booking.reschedule(a.id, new Date(body.startsAt), null, { staff: false }));
  }
}
