import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import type { Response } from 'express';
import { changePasswordSchema, loginSchema, registerSchema } from '@barberflow/shared';
import { Authenticated, CurrentAuth, ReqIp } from '../common/decorators';
import type { AppRequest, AuthContext } from '../common/request-context';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

class RegisterDto extends createZodDto(registerSchema) {}
class LoginDto extends createZodDto(loginSchema) {}
class ChangePasswordDto extends createZodDto(changePasswordSchema) {}

/** Staff sign-in (barbers, owners, admins). Clients book without an account. */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly sessions: SessionService) {}

  @Post('register')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  async register(@Body() body: RegisterDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response, @ReqIp() ip: string | null) {
    const user = await this.auth.register(body, ip);
    const { token, expiresAt } = await this.sessions.create(user.id, { ip, userAgent: req.headers['user-agent'] });
    this.sessions.setCookie(res, token, expiresAt);
    return this.auth.me(user);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async login(@Body() body: LoginDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response, @ReqIp() ip: string | null) {
    const user = await this.auth.login(body.phone, body.password, ip);
    const { token, expiresAt } = await this.sessions.create(user.id, { ip, userAgent: req.headers['user-agent'] });
    this.sessions.setCookie(res, token, expiresAt);
    return this.auth.me(user);
  }

  @Post('password')
  @HttpCode(200)
  @Authenticated()
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async changePassword(@CurrentAuth() auth: AuthContext, @Body() body: ChangePasswordDto, @ReqIp() ip: string | null) {
    await this.auth.changePassword(auth.user, body.currentPassword, body.newPassword, auth.sessionId, ip);
    return { ok: true };
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
}
