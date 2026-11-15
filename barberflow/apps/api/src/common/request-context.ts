import type { Request } from 'express';
import type { MemberRole, User } from '@barberflow/db';

export interface AuthContext {
  user: User;
  sessionId: string;
}

export interface MembershipContext {
  businessId: string;
  role: MemberRole;
  /** Barber profile of the current user inside this business, if any. */
  barberId: string | null;
}

export type AppRequest = Request & { auth?: AuthContext; membership?: MembershipContext };

export function clientIp(req: Request): string | null {
  return (req.ip ?? req.socket?.remoteAddress ?? null) || null;
}
