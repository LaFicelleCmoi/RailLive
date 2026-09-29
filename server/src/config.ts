import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/src → server/.env  (et server/dist → server/.env une fois compilé)
dotenv.config({ path: path.resolve(here, '../.env'), quiet: true });

const EnvSchema = z.object({
  SNCF_API_KEY: z
    .string({ error: 'SNCF_API_KEY manquant dans server/.env' })
    .trim()
    .min(10, 'SNCF_API_KEY semble invalide (trop court)'),
  SNCF_API_BASE_URL: z.url().default('https://api.sncf.com/v1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  ALLOWED_ORIGIN: z.string().default('http://localhost:5173'),
  DAILY_QUOTA: z.coerce.number().int().positive().default(5000),
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

/** Exécution en fonction serverless Vercel */
const isServerless = !!process.env.VERCEL;

/** Domaines Vercel du déploiement courant, autorisés automatiquement en CORS. */
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter((h): h is string => !!h)
  .map((h) => `https://${h}`);

export const config = Object.freeze({
  ...parsed.data,
  // Derrière le proxy de Vercel, l'IP réelle est dans X-Forwarded-For (nécessaire au rate limiting)
  TRUST_PROXY: isServerless && !process.env.TRUST_PROXY ? 1 : parsed.data.TRUST_PROXY,
  /** L'API SNCF n'expose qu'une couverture : « sncf ». */
  COVERAGE: 'sncf',
  allowedOrigins: [
    ...parsed.data.ALLOWED_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    ...vercelOrigins,
  ],
  isProd: parsed.data.NODE_ENV === 'production',
  isServerless,
});

/** Valeurs sensibles à masquer dans tout log ou message d'erreur. */
export const SECRETS: readonly string[] = [
  config.SNCF_API_KEY,
  Buffer.from(`${config.SNCF_API_KEY}:`).toString('base64'),
];
