import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { User } from '@barberflow/db';
import { ErrorCodes, MeDto, formatUzPhone } from '@barberflow/shared';
import { APP_CONFIG, AppConfig } from '../config';
import { AppError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { hmac, safeEqualHex, sixDigitCode } from './crypto';
import { SMS_PROVIDER, SmsProvider } from './sms.provider';
import { verifyTelegramInitData } from './telegram-init-data';

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_WINDOW = 3;
const OTP_WINDOW_MS = 10 * 60_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /** Dev OTP is only possible outside production AND when explicitly enabled. */
  get devOtpEnabled() {
    return this.config.NODE_ENV !== 'production' && this.config.OTP_DEV_MODE;
  }

  async requestOtp(phone: string, ip: string | null): Promise<{ sent: boolean; devCode?: string; expiresInSec: number }> {
    if (!this.sms.delivers && !this.devOtpEnabled && this.sms.name !== 'console') {
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'SMS_UNAVAILABLE', 'SMS provider is not configured');
    }
    const recent = await this.prisma.otpCode.count({
      where: { phone, createdAt: { gt: new Date(Date.now() - OTP_WINDOW_MS) } },
    });
    if (recent >= (this.config.RELAX_RATE_LIMITS ? 100 : OTP_MAX_PER_WINDOW)) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.RATE_LIMITED, 'Too many codes requested');
    }
    const code = sixDigitCode();
    await this.prisma.otpCode.create({
      data: { phone, codeHash: hmac(this.config.OTP_SECRET, `${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS), ip },
    });
    const text = `BARBERFLOW: ${code} — kirish kodi / код для входа. Hech kimga bermang / Никому не сообщайте.`;
    if (this.sms.delivers || this.sms.name === 'console') {
      await this.sms.send(phone, text);
    }
    return {
      sent: this.sms.delivers,
      expiresInSec: OTP_TTL_MS / 1000,
      ...(this.devOtpEnabled && !this.sms.delivers ? { devCode: code } : {}),
    };
  }

  async verifyOtp(phone: string, code: string, name: string | undefined, ip: string | null): Promise<User> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date() || otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new AppError(HttpStatus.BAD_REQUEST, ErrorCodes.OTP_EXPIRED, 'Code expired');
    }
    // Count the attempt before comparing so parallel guesses cannot exceed the limit unnoticed.
    const updated = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, attempts: { lt: OTP_MAX_ATTEMPTS }, consumedAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (updated.count === 0) throw new AppError(HttpStatus.BAD_REQUEST, ErrorCodes.OTP_EXPIRED, 'Code expired');
    if (!safeEqualHex(otp.codeHash, hmac(this.config.OTP_SECRET, `${phone}:${code}`))) {
      throw new AppError(HttpStatus.BAD_REQUEST, ErrorCodes.OTP_INVALID, 'Invalid code');
    }
    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw new AppError(HttpStatus.BAD_REQUEST, ErrorCodes.OTP_EXPIRED, 'Code already used');

    const adminPhones = (this.config.PLATFORM_ADMIN_PHONES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing?.deletedAt) throw new AppError(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN, 'Account deleted');
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            ...(name && !existing.name ? { name } : {}),
            ...(adminPhones.includes(phone) ? { platformRole: 'PLATFORM_ADMIN' } : {}),
          },
        })
      : await this.prisma.user.create({
          data: {
            phone,
            name: name || null,
            privacyAcceptedAt: new Date(),
            platformRole: adminPhones.includes(phone) ? 'PLATFORM_ADMIN' : 'USER',
          },
        });
    await this.audit.log({ actorUserId: user.id, action: 'auth.login.otp', entityType: 'user', entityId: user.id, ip });
    return user;
  }

  async loginWithTelegram(initData: string, ip: string | null): Promise<{ user: User; startParam: string | null }> {
    if (!this.config.TELEGRAM_BOT_TOKEN) {
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'TELEGRAM_NOT_CONFIGURED', 'Telegram bot is not configured');
    }
    const verified = verifyTelegramInitData(initData, this.config.TELEGRAM_BOT_TOKEN, this.config.TELEGRAM_AUTH_MAX_AGE);
    if (!verified) throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHORIZED, 'Invalid Telegram initData');
    const tg = verified.user;
    const telegramId = BigInt(tg.id);
    const displayName = [tg.first_name, tg.last_name].filter(Boolean).join(' ').slice(0, 80) || null;
    const locale = tg.language_code === 'uz' ? 'uz' : 'ru';
    const existing = await this.prisma.user.findUnique({ where: { telegramId } });
    if (existing?.deletedAt) throw new AppError(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN, 'Account deleted');
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            telegramUsername: tg.username ?? null,
            ...(tg.allows_write_to_pm ? { telegramChatId: telegramId } : {}),
            ...(!existing.name && displayName ? { name: displayName } : {}),
          },
        })
      : await this.prisma.user.create({
          data: {
            telegramId,
            telegramUsername: tg.username ?? null,
            telegramChatId: tg.allows_write_to_pm ? telegramId : null,
            name: displayName,
            locale,
            privacyAcceptedAt: new Date(),
          },
        });
    await this.audit.log({ actorUserId: user.id, action: 'auth.login.telegram', entityType: 'user', entityId: user.id, ip });
    return { user, startParam: verified.startParam };
  }

  async me(user: User): Promise<MeDto> {
    const memberships = await this.prisma.businessMember.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { business: { select: { id: true, name: true, slug: true, onboardingStep: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const barbers = await this.prisma.barber.findMany({ where: { userId: user.id }, select: { id: true, businessId: true } });
    const invitations = user.phone
      ? await this.prisma.invitation.findMany({
          where: { phone: user.phone, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          include: { business: { select: { name: true } } },
        })
      : [];
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      locale: user.locale === 'uz' ? 'uz' : 'ru',
      isPlatformAdmin: user.platformRole === 'PLATFORM_ADMIN',
      telegramLinked: user.telegramChatId !== null,
      memberships: memberships.map((m) => ({
        businessId: m.businessId,
        businessName: m.business.name,
        businessSlug: m.business.slug,
        role: m.role,
        onboardingStep: m.business.onboardingStep,
        barberId: barbers.find((b) => b.businessId === m.businessId)?.id ?? null,
      })),
      pendingInvitations: invitations.map((i) => ({ id: i.id, businessName: i.business.name, role: i.role })),
    };
  }

  maskForLog(phone: string) {
    return formatUzPhone(phone).replace(/\d{3} \d{2}(?= \d{2}$)/, '*** **');
  }
}
