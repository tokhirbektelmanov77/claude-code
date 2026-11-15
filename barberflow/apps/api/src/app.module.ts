import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { APP_CONFIG, loadConfig } from './config';
import { PrismaService } from './common/prisma.service';
import { AuditService } from './common/audit.service';
import { AllExceptionsFilter } from './common/exception.filter';
import { AuthGuard, BusinessAccessGuard, PlatformAdminGuard } from './common/guards';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { SessionService } from './auth/session.service';
import { SessionMiddleware } from './auth/session.middleware';
import { AvailabilityService } from './booking/availability.service';
import { BookingService } from './booking/booking.service';
import { StaffAppointmentsController } from './booking/staff-appointments.controller';
import { PublicController } from './public/public.controller';
import { PublicService } from './public/public.service';
import { MeController } from './me/me.controller';
import { BusinessController } from './business/business.controller';
import { BusinessService } from './business/business.service';
import { CatalogController } from './business/catalog.controller';
import { TeamController } from './business/team.controller';
import { ScheduleController } from './schedule/schedule.controller';
import { PlatformAdminController } from './platform-admin/platform-admin.controller';
import { SubscriptionBillingService } from './subscriptions/billing.service';
import { HealthController } from './health/health.controller';

const config = loadConfig();

@Module({
  imports: [
    // Global per-IP limit; sensitive routes (OTP, booking) set stricter @Throttle values.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: config.NODE_ENV === 'test' ? 10_000 : 300 }],
      skipIf: () => config.NODE_ENV === 'test' || config.RELAX_RATE_LIMITS,
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    PublicController,
    MeController,
    BusinessController,
    CatalogController,
    TeamController,
    ScheduleController,
    StaffAppointmentsController,
    PlatformAdminController,
  ],
  providers: [
    { provide: APP_CONFIG, useValue: config },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    PrismaService,
    AuditService,
    SessionService,
    AuthService,
    AuthGuard,
    BusinessAccessGuard,
    PlatformAdminGuard,
    AvailabilityService,
    BookingService,
    PublicService,
    BusinessService,
    SubscriptionBillingService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}
