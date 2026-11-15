import { createParamDecorator, ExecutionContext, SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import type { MemberRole } from '@barberflow/db';
import type { AppRequest, AuthContext, MembershipContext } from './request-context';
import { AuthGuard, BusinessAccessGuard, PlatformAdminGuard } from './guards';

export const ROLES_KEY = 'bf:roles';

/** Requires a valid session. */
export const Authenticated = () => applyDecorators(UseGuards(AuthGuard));

/**
 * Requires an ACTIVE membership in the business named by the :businessId route param with one of
 * the given roles. Data access must still filter by businessId (defence in depth).
 */
export const BusinessRoles = (...roles: MemberRole[]) =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(AuthGuard, BusinessAccessGuard));

export const PlatformAdminOnly = () => applyDecorators(UseGuards(AuthGuard, PlatformAdminGuard));

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  return ctx.switchToHttp().getRequest<AppRequest>().auth!;
});

export const OptionalAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext | undefined => {
  return ctx.switchToHttp().getRequest<AppRequest>().auth;
});

export const Membership = createParamDecorator((_: unknown, ctx: ExecutionContext): MembershipContext => {
  return ctx.switchToHttp().getRequest<AppRequest>().membership!;
});

export const ReqIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return req.ip ?? null;
});
