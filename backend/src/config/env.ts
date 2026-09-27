import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('*'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters — do not ship a default'),
  JWT_EXPIRES_IN: z.string().default('12h'),

  TRANSFER_BASE_LEG_HOURS: z.coerce.number().positive().default(2),
  TRANSFER_MARITIME_MULTIPLIER: z.coerce.number().min(1).default(2),
  RETENTION_DEFAULT_PCT: z.coerce.number().gt(0).lte(1).default(0.3),
  RETENTION_LOWERED_PCT: z.coerce.number().gt(0).lte(1).default(0.15),
});

export type Env = z.infer<typeof envSchema>;

// Refuse to boot on a bad configuration rather than fail later with something
// cryptic.
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  if (parsed.data.RETENTION_LOWERED_PCT > parsed.data.RETENTION_DEFAULT_PCT) {
    throw new Error(
      'RETENTION_LOWERED_PCT must be lower than RETENTION_DEFAULT_PCT: the level-5 override lowers the threshold, it never raises it.',
    );
  }
  return parsed.data;
}
