import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { cancelSchema, isoDate, manualBookingSchema, rescheduleSchema, statusChangeSchema, uuid } from '@barberflow/shared';
import { BusinessRoles, CurrentAuth, Membership } from '../common/decorators';
import type { AuthContext, MembershipContext } from '../common/request-context';
import { notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { assertBarberScope, barberAppointmentScope, isManager } from '../business/access';
import { APPOINTMENT_INCLUDE, BookingService, toAppointmentDto } from './booking.service';
import { AvailabilityService } from './availability.service';

class ManualDto extends createZodDto(manualBookingSchema) {}
class RescheduleDto extends createZodDto(rescheduleSchema) {}
class CancelDto extends createZodDto(cancelSchema) {}
class StatusDto extends createZodDto(statusChangeSchema) {}
class RangeQuery extends createZodDto(
  z.object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    barberId: uuid.optional(),
  }).refine((v) => new Date(v.to).getTime() - new Date(v.from).getTime() <= 45 * 86400_000, 'RANGE_TOO_LARGE'),
) {}
class StaffSlotsQuery extends createZodDto(z.object({ serviceId: uuid, date: isoDate, excludeAppointmentId: uuid.optional() })) {}

@ApiTags('staff-appointments')
@Controller('businesses/:businessId')
export class StaffAppointmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly booking: BookingService,
    private readonly availability: AvailabilityService,
  ) {}

  private async appointment(businessId: string, id: string, m: MembershipContext) {
    const a = await this.prisma.appointment.findFirst({ where: { id, businessId }, include: APPOINTMENT_INCLUDE });
    if (!a) throw notFound('Appointment');
    assertBarberScope(m, a.barberId);
    return a;
  }

  /** Calendar feed: appointments, exceptions and weekly hours for the visible range. */
  @Get('calendar')
  @BusinessRoles()
  async calendar(@Param('businessId') businessId: string, @Query() q: RangeQuery, @Membership() m: MembershipContext) {
    const from = new Date(q.from);
    const to = new Date(q.to);
    const barberFilter = isManager(m) ? q.barberId : (m.barberId ?? '00000000-0000-0000-0000-000000000000');
    const barbers = await this.prisma.barber.findMany({
      where: { businessId, ...(barberFilter ? { id: barberFilter } : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { workingHours: true },
    });
    const ids = barbers.map((b) => b.id);
    const [appointments, exceptions] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { businessId, barberId: { in: ids }, startsAt: { lt: to }, endsAt: { gt: from } },
        include: APPOINTMENT_INCLUDE,
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.scheduleException.findMany({ where: { barberId: { in: ids }, startsAt: { lt: to }, endsAt: { gt: from } } }),
    ]);
    return {
      barbers: barbers.map((b) => ({
        id: b.id, name: b.name, photoUrl: b.photoUrl, slug: b.slug,
        workingHours: b.workingHours.map((w) => ({ weekday: w.weekday, startMin: w.startMin, endMin: w.endMin })),
      })),
      appointments: appointments.map((a) => toAppointmentDto(a)),
      exceptions: exceptions.map((e) => ({ id: e.id, barberId: e.barberId, type: e.type, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(), note: e.note })),
    };
  }

  @Get('barbers/:barberId/slots')
  @BusinessRoles()
  async slots(@Param('businessId') businessId: string, @Param('barberId', ParseUUIDPipe) barberId: string, @Query() q: StaffSlotsQuery, @Membership() m: MembershipContext) {
    assertBarberScope(m, barberId);
    const b = await this.prisma.barber.findFirst({ where: { id: barberId, businessId } });
    if (!b) throw notFound('Barber');
    return {
      date: q.date,
      slots: await this.availability.slotsForDate(barberId, q.serviceId, q.date, {
        ignoreHorizon: true, ignoreLeadTime: true, excludeAppointmentId: q.excludeAppointmentId,
      }),
    };
  }

  /** Manual booking uses the same engine and constraint as online booking. */
  @Post('appointments')
  @BusinessRoles()
  async create(
    @Param('businessId') businessId: string, @Body() body: ManualDto, @CurrentAuth() auth: AuthContext,
    @Membership() m: MembershipContext, @Headers('idempotency-key') idem?: string,
  ) {
    assertBarberScope(m, body.barberId);
    // A barber may pick an existing card only for their own customers (same rule as the customer list).
    if (body.customerId && !isManager(m)) {
      const own = await this.prisma.customer.count({
        where: { id: body.customerId, businessId, anonymizedAt: null, appointments: { some: barberAppointmentScope(m) } },
      });
      if (!own) throw notFound('Customer');
    }
    const { appointment, replayed } = await this.booking.create({
      businessId,
      barberId: body.barberId,
      serviceId: body.serviceId,
      startsAt: new Date(body.startsAt),
      customer: body.customerId
        ? { kind: 'existing', customerId: body.customerId }
        : { kind: 'new', name: body.customer!.name, phone: body.customer!.phone || null },
      source: 'MANUAL',
      actorUserId: auth.user.id,
      note: body.note,
      idempotencyKey: idem?.slice(0, 100) ?? null,
      staff: true,
    });
    return { ...toAppointmentDto(appointment), replayed };
  }

  @Get('appointments/:id')
  @BusinessRoles()
  async one(@Param('businessId') businessId: string, @Param('id', ParseUUIDPipe) id: string, @Membership() m: MembershipContext) {
    const a = await this.appointment(businessId, id, m);
    const [events, visits] = await Promise.all([
      this.prisma.appointmentEvent.findMany({ where: { appointmentId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.appointment.count({ where: { customerId: a.customerId, businessId, status: 'COMPLETED' } }),
    ]);
    return { ...toAppointmentDto(a), events, customerVisits: visits };
  }

  @Post('appointments/:id/cancel')
  @HttpCode(200)
  @BusinessRoles()
  async cancel(@Param('businessId') businessId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: CancelDto, @CurrentAuth() auth: AuthContext, @Membership() m: MembershipContext) {
    await this.appointment(businessId, id, m);
    return toAppointmentDto(await this.booking.cancel(id, auth.user.id, body.reason ?? null, { businessId }));
  }

  @Post('appointments/:id/reschedule')
  @HttpCode(200)
  @BusinessRoles()
  async reschedule(@Param('businessId') businessId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: RescheduleDto, @CurrentAuth() auth: AuthContext, @Membership() m: MembershipContext) {
    await this.appointment(businessId, id, m);
    return toAppointmentDto(await this.booking.reschedule(id, new Date(body.startsAt), auth.user.id, { staff: true, businessId }));
  }

  @Post('appointments/:id/status')
  @HttpCode(200)
  @BusinessRoles()
  async status(@Param('businessId') businessId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: StatusDto, @CurrentAuth() auth: AuthContext, @Membership() m: MembershipContext) {
    await this.appointment(businessId, id, m);
    return toAppointmentDto(await this.booking.setOutcome(id, body.status, auth.user.id, businessId));
  }
}
