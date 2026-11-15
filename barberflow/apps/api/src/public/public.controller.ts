import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { availabilityQuerySchema, availableDatesQuerySchema } from '@barberflow/shared';
import { AvailabilityService } from '../booking/availability.service';
import { PublicService } from './public.service';

class SlotsQuery extends createZodDto(availabilityQuerySchema) {}
class DatesQuery extends createZodDto(availableDatesQuerySchema) {}

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly svc: PublicService, private readonly availability: AvailabilityService) {}

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
}
