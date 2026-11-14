import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  GOOGLE_CLIENT_IDS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  /**
   * How many reverse proxies in front of the API append to X-Forwarded-For.
   * Express then takes the client IP from that many entries from the right, so
   * the rate limiter sees real clients and spoofed left-hand entries are ignored.
   * 0 (default) ignores X-Forwarded-For. Check GET /api/health/client-ip to pick it.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  /** Where uploaded attachments are stored (relative to the API folder). */
  STORAGE_DIR: z.string().default('storage'),
  DEFAULT_CURRENCY: z.string().length(3).toUpperCase().default('INR'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
