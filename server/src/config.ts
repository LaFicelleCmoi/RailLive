import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/src → server/.env  (et server/dist → server/.env une fois compilé)
dotenv.config({ path: path.resolve(here, '../.env'), quiet: true });

const EnvSchema = z.object({
  NAVITIA_TOKEN: z
    .string({ error: 'NAVITIA_TOKEN manquant dans server/.env' })
    .trim()
    .min(10, 'NAVITIA_TOKEN semble invalide (trop court)'),
  NAVITIA_BASE_URL: z.url().default('https://api.navitia.io/v1'),
  NAVITIA_COVERAGE: z
    .string()
    .regex(/^[a-z0-9_-]+$/i)
    .default('sncf'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  ALLOWED_ORIGIN: z.string().default('http://localhost:5173'),
  DAILY_QUOTA: z.coerce.number().int().positive().default(3000),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // On n'affiche que les noms de variables et les messages, jamais les valeurs.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`\n[railhub] Configuration invalide :\n${issues}\n\nCopiez server/.env.example vers server/.env.\n`);
  process.exit(1);
}

export const config = Object.freeze({
  ...parsed.data,
  allowedOrigins: parsed.data.ALLOWED_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
});

/** Valeurs sensibles à masquer dans tout log ou message d'erreur. */
export const SECRETS: readonly string[] = [config.NAVITIA_TOKEN];
