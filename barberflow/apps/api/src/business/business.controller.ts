import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createBusinessSchema, slug, updateBusinessSchema } from '@barberflow/shared';
import { Authenticated, BusinessRoles, CurrentAuth, Membership, ReqIp } from '../common/decorators';
import type { AuthContext, MembershipContext } from '../common/request-context';
import { BusinessService } from './business.service';
import { isManager } from './access';

class CreateBusinessDto extends createZodDto(createBusinessSchema) {}
class UpdateBusinessDto extends createZodDto(updateBusinessSchema) {}
class SlugDto extends createZodDto(z.object({ slug })) {}

@ApiTags('business')
@Controller('businesses')
export class BusinessController {
  constructor(private readonly svc: BusinessService) {}

  /** Onboarding step 2: any signed-in user can open a business and becomes its OWNER. */
  @Post()
  @Authenticated()
  create(@CurrentAuth() auth: AuthContext, @Body() body: CreateBusinessDto, @ReqIp() ip: string | null) {
    return this.svc.create(auth.user.id, body, ip);
  }

  @Get(':businessId')
  @BusinessRoles()
  async get(@Param('businessId') businessId: string, @Membership() m: MembershipContext) {
    const b = await this.svc.get(businessId);
    return { ...b, myRole: m.role, myBarberId: m.barberId };
  }

  @Patch(':businessId')
  @BusinessRoles('OWNER', 'MANAGER')
  update(@Param('businessId') businessId: string, @Body() body: UpdateBusinessDto, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    return this.svc.update(businessId, body, auth.user.id, ip);
  }

  @Patch(':businessId/slug')
  @BusinessRoles('OWNER')
  updateSlug(@Param('businessId') businessId: string, @Body() body: SlugDto, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    return this.svc.updateSlug(businessId, body.slug, auth.user.id, ip);
  }

  /** Barbers see their own numbers, owners/managers the whole business. */
  @Get(':businessId/dashboard')
  @BusinessRoles()
  dashboard(@Param('businessId') businessId: string, @Membership() m: MembershipContext) {
    return this.svc.dashboard(businessId, isManager(m) ? null : m.barberId ?? '00000000-0000-0000-0000-000000000000');
  }

  @Get(':businessId/subscription')
  @BusinessRoles('OWNER', 'MANAGER')
  subscription(@Param('businessId') businessId: string) {
    return this.svc.subscription(businessId);
  }
}
