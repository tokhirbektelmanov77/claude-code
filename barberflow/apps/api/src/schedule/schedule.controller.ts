import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { scheduleExceptionSchema, workingHoursSchema } from '@barberflow/shared';
import { BusinessRoles, CurrentAuth, Membership, ReqIp } from '../common/decorators';
import type { AuthContext, MembershipContext } from '../common/request-context';
import { notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { assertBarberScope } from '../business/access';

class WorkingHoursDto extends createZodDto(workingHoursSchema) {}
class ExceptionDto extends createZodDto(scheduleExceptionSchema) {}

@ApiTags('schedule')
@Controller('businesses/:businessId/barbers/:barberId')
export class ScheduleController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async barber(businessId: string, barberId: string, m: MembershipContext) {
    assertBarberScope(m, barberId);
    const b = await this.prisma.barber.findFirst({ where: { id: barberId, businessId } });
    if (!b) throw notFound('Barber');
    return b;
  }

  @Get('working-hours')
  @BusinessRoles()
  async getHours(@Param('businessId') businessId: string, @Param('barberId', ParseUUIDPipe) barberId: string, @Membership() m: MembershipContext) {
    await this.barber(businessId, barberId, m);
    return this.prisma.workingHours.findMany({ where: { barberId }, orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }] });
  }

  /** Replaces the weekly template. Existing appointments are untouched. */
  @Put('working-hours')
  @BusinessRoles()
  async setHours(
    @Param('businessId') businessId: string, @Param('barberId', ParseUUIDPipe) barberId: string, @Body() body: WorkingHoursDto,
    @Membership() m: MembershipContext, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null,
  ) {
    await this.barber(businessId, barberId, m);
    await this.prisma.$transaction([
      this.prisma.workingHours.deleteMany({ where: { barberId } }),
      this.prisma.workingHours.createMany({ data: body.intervals.map((i) => ({ ...i, barberId })) }),
    ]);
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'schedule.hours.update', entityType: 'barber', entityId: barberId, data: { intervals: body.intervals.length }, ip });
    return this.prisma.workingHours.findMany({ where: { barberId }, orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }] });
  }

  @Get('exceptions')
  @BusinessRoles()
  async exceptions(@Param('businessId') businessId: string, @Param('barberId', ParseUUIDPipe) barberId: string, @Membership() m: MembershipContext) {
    await this.barber(businessId, barberId, m);
    return this.prisma.scheduleException.findMany({
      where: { barberId, endsAt: { gt: new Date(Date.now() - 7 * 86400_000) } },
      orderBy: { startsAt: 'asc' },
    });
  }

  @Post('exceptions')
  @BusinessRoles()
  async addException(
    @Param('businessId') businessId: string, @Param('barberId', ParseUUIDPipe) barberId: string, @Body() body: ExceptionDto,
    @Membership() m: MembershipContext, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null,
  ) {
    await this.barber(businessId, barberId, m);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    const exception = await this.prisma.scheduleException.create({
      data: { barberId, type: body.type, startsAt, endsAt, note: body.note, createdBy: auth.user.id },
    });
    // Existing bookings are not cancelled automatically; the UI warns so staff can move them.
    const affected = await this.prisma.appointment.count({
      where: { barberId, status: 'CONFIRMED', startsAt: { lt: endsAt }, blockedUntil: { gt: startsAt } },
    });
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'schedule.exception.create', entityType: 'schedule_exception', entityId: exception.id, data: { type: body.type }, ip });
    return { ...exception, affectedAppointments: affected };
  }

  @Delete('exceptions/:id')
  @BusinessRoles()
  async removeException(
    @Param('businessId') businessId: string, @Param('barberId', ParseUUIDPipe) barberId: string, @Param('id', ParseUUIDPipe) id: string,
    @Membership() m: MembershipContext, @CurrentAuth() auth: AuthContext,
  ) {
    await this.barber(businessId, barberId, m);
    const res = await this.prisma.scheduleException.deleteMany({ where: { id, barberId } });
    if (!res.count) throw notFound('Exception');
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'schedule.exception.delete', entityType: 'schedule_exception', entityId: id });
    return { ok: true };
  }
}
