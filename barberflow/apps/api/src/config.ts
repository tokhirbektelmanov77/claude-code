import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  /** Public origin of the web app, used for CORS, Origin checks and links in messages. */
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SECURE: bool,
  TRUST_PROXY: bool,
  /** DEV/E2E ONLY: disables request throttling and the guest per-phone booking cap. Refused in production. */
  RELAX_RATE_LIMITS: bool,
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error('Invalid environment: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production' && cfg.RELAX_RATE_LIMITS) {
    throw new Error('RELAX_RATE_LIMITS must not be enabled in production');
  }
  return cfg;
}

export const APP_CONFIG = Symbol('APP_CONFIG');
