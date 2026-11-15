import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import type { Response } from 'express';
import { otpRequestSchema, otpVerifySchema, telegramAuthSchema } from '@barberflow/shared';
import { Authenticated, CurrentAuth, ReqIp } from '../common/decorators';
import type { AppRequest, AuthContext } from '../common/request-context';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

class OtpRequestDto extends createZodDto(otpRequestSchema) {}
class OtpVerifyDto extends createZodDto(otpVerifySchema) {}
class TelegramAuthDto extends createZodDto(telegramAuthSchema) {}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly sessions: SessionService) {}

  @Post('otp/request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  requestOtp(@Body() body: OtpRequestDto, @ReqIp() ip: string | null) {
    return this.auth.requestOtp(body.phone, ip);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async verifyOtp(@Body() body: OtpVerifyDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response, @ReqIp() ip: string | null) {
    const user = await this.auth.verifyOtp(body.phone, body.code, body.name, ip);
    const { token, expiresAt } = await this.sessions.create(user.id, { ip, userAgent: req.headers['user-agent'] });
    this.sessions.setCookie(res, token, expiresAt);
    return this.auth.me(user);
  }

  @Post('telegram')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  async telegram(@Body() body: TelegramAuthDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response, @ReqIp() ip: string | null) {
    const { user, startParam } = await this.auth.loginWithTelegram(body.initData, ip);
    const { token, expiresAt } = await this.sessions.create(user.id, { ip, userAgent: req.headers['user-agent'] });
    this.sessions.setCookie(res, token, expiresAt);
    return { me: await this.auth.me(user), startParam };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    if (req.auth) await this.sessions.revoke(req.auth.sessionId);
    this.sessions.clearCookie(res);
    return { ok: true };
  }

  @Get('me')
  @Authenticated()
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth.user);
  }

  /** Lets the UI know which login methods actually work on this deployment. */
  @Get('methods')
  methods() {
    return {
      otp: true,
      otpDevMode: this.auth.devOtpEnabled,
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? null,
    };
  }
}
