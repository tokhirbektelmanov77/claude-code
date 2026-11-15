import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { APP_CONFIG, AppConfig } from '../config';
import { forbidden } from '../common/errors';
import type { AppRequest } from '../common/request-context';
import { SESSION_COOKIE, SessionService } from './session.service';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Resolves the session cookie into req.auth and blocks cross-site state-changing requests.
 * SameSite=Lax already stops cookies on cross-site POSTs; the Origin check is a second layer.
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly sessions: SessionService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async use(req: AppRequest, _res: Response, next: NextFunction) {
    try {
      if (UNSAFE.has(req.method)) {
        const origin = req.headers.origin;
        if (origin && origin !== this.config.WEB_ORIGIN && origin !== `http://localhost:${this.config.PORT}`) {
          throw forbidden('Cross-origin request rejected');
        }
      }
      const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
      const session = await this.sessions.resolve(token);
      if (session) req.auth = { user: session.user, sessionId: session.id };
      next();
    } catch (e) {
      next(e);
    }
  }
}
