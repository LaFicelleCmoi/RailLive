import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { proxyRouter } from './routes/proxy.js';
import { metaRouter } from './routes/meta.js';
import { liveRouter } from './routes/live.js';
import { insightsRouter } from './routes/insights.js';
import { geoRouter } from './routes/geo.js';
import { loadRailGraph } from './rail/graph.js';
import { log } from './utils/redact.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.TRUST_PROXY);
app.set('query parser', 'simple');

// Vercel : la réécriture /api/* → api/index.js peut ajouter le segment capturé en paramètre « path ».
// On le retire avant toute validation (la liste blanche refuse les paramètres inconnus).
if (config.isServerless) {
  app.use((req, _res, next) => {
    const url = new URL(req.url, 'http://local');
    if (url.searchParams.has('path')) {
      url.searchParams.delete('path');
      req.url = `${url.pathname}${url.search}`;
      req.originalUrl = req.url;
    }
    next();
  });
}

const MAP_HOSTS =['https://basemaps.cartocdn.com', 'https://*.basemaps.cartocdn.com'];

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', ...MAP_HOSTS],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'", ...MAP_HOSTS],
        'worker-src': ["'self'", 'blob:'],
        'child-src': ["'self'", 'blob:'],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);

app.use(
  '/api',
  cors({
    origin(origin, cb) {
      // Requêtes same-origin (pas d'en-tête Origin) ou origine explicitement autorisée
      if (!origin || config.allowedOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    methods: ['GET'],
    maxAge: 600,
  }),
);

app.use(compression());

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.RATE_LIMIT_PER_MINUTE,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Trop de requêtes, patientez quelques secondes.' } },
});
const liveLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Trop de requêtes sur la carte live.' } },
});

// Seules les requêtes GET sont acceptées sur l'API
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'Méthode non autorisée' } });
  }
  next();
});

app.use('/api/meta', metaRouter);
app.use('/api/live', liveLimiter, liveRouter);
app.use('/api/insights', liveLimiter, insightsRouter);
app.use('/api/geo', apiLimiter, geoRouter);
app.use('/api/sncf', apiLimiter, proxyRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Endpoint inconnu' } });
});

// En production (hors Vercel, qui sert lui-même dist/), le serveur sert aussi le front compilé
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '../../dist');
if (config.isProd && !config.isServerless && fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      index: false,
      maxAge: '1y',
      immutable: true,
      setHeaders(res, file) {
        if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  // Refuse explicitement toute source map éventuelle
  app.get(/\.map$/, (_req, res) => res.status(404).end());
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Gestionnaire d'erreurs final : aucun détail interne n'est renvoyé
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  log.error('Erreur non gérée', err);
  res.status(500).json({ error: { code: 'internal', message: 'Erreur interne' } });
});

// Sur Vercel (fonction serverless), il n'y a pas d'appel à listen() : le graphe ferroviaire
// se charge à l'import, pendant le démarrage à froid de la fonction.
if (config.isServerless) void loadRailGraph();

export default app;
