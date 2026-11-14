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
   * How many proxy hops sit in front of the API, counting the socket peer (3 on Render).
   * Express then takes the client IP from that many entries from the right, so
   * the rate limiter sees real clients and spoofed left-hand entries are ignored.
   * 0 (default) ignores X-Forwarded-For. Check GET /api/health/client-ip to pick it.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  /** Where attachments live: `local` disk (dev, tests) or an `s3`-compatible bucket (R2 in production). */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  /** Local driver: where uploaded attachments are stored (relative to the API folder). */
  STORAGE_DIR: z.string().default('storage'),
  /** S3 driver, e.g. https://<account-id>.r2.cloudflarestorage.com for Cloudflare R2. */
  S3_ENDPOINT: z.url().optional(),
  /** `auto` for R2. */
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  DEFAULT_CURRENCY: z.string().length(3).toUpperCase().default('INR'),
});

export type Env = z.infer<typeof envSchema>;

const S3_REQUIRED = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema
    .superRefine((env, ctx) => {
      // Fail at startup, not on the first upload.
      if (env.STORAGE_DRIVER !== 's3') return;
      for (const key of S3_REQUIRED) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when STORAGE_DRIVER=s3' });
      }
    })
    .safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
