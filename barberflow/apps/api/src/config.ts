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
  /** Used to HMAC one-time codes. Must be long and random in production. */
  OTP_SECRET: z.string().min(16).default('dev-only-otp-secret-change-me'),
  /**
   * DEV ONLY: when true and no SMS provider is configured, the OTP is returned in the API response
   * and shown in the UI under a "test mode" banner. Refused in production.
   */
  OTP_DEV_MODE: bool,
  SMS_PROVIDER: z.enum(['none', 'console']).default('none'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SECURE: bool,
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  /** Max age of Telegram initData accepted by /auth/telegram, seconds. */
  TELEGRAM_AUTH_MAX_AGE: z.coerce.number().int().default(86400),
  /** Phones (E.164, comma separated) granted PLATFORM_ADMIN at login. Optional bootstrap mechanism. */
  PLATFORM_ADMIN_PHONES: z.string().optional(),
  TRUST_PROXY: bool,
  /** DEV/E2E ONLY: disables request throttling and the per-phone OTP cap. Refused in production. */
  RELAX_RATE_LIMITS: bool,
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error('Invalid environment: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production') {
    if (cfg.OTP_DEV_MODE) throw new Error('OTP_DEV_MODE must not be enabled in production');
    if (cfg.SMS_PROVIDER === 'console') throw new Error('SMS_PROVIDER=console is development-only');
    if (cfg.OTP_SECRET.startsWith('dev-only')) throw new Error('Set a random OTP_SECRET in production');
    if (cfg.RELAX_RATE_LIMITS) throw new Error('RELAX_RATE_LIMITS must not be enabled in production');
  }
  return cfg;
}

export const APP_CONFIG = Symbol('APP_CONFIG');
