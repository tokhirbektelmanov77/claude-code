import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { APP_CONFIG, AppConfig } from '../config';
import { PrismaService } from '../common/prisma.service';
import { newToken, sha256 } from './crypto';

export const SESSION_COOKIE = 'bf_session';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async create(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
    const token = newToken();
    const expiresAt = new Date(Date.now() + this.config.SESSION_TTL_DAYS * 86400_000);
    await this.prisma.session.create({
      data: { userId, tokenHash: sha256(token), expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null },
    });
    return { token, expiresAt };
  }

  async resolve(token: string | undefined) {
    if (!token || token.length > 200) return null;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.deletedAt) return null;
    // Touch at most every 10 minutes to avoid a write per request.
    if (Date.now() - session.lastSeenAt.getTime() > 600_000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
    return session;
  }

  async revoke(sessionId: string) {
    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  setCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.COOKIE_SECURE || this.config.NODE_ENV === 'production',
      path: '/',
      expires: expiresAt,
    });
  }

  clearCookie(res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}
