import { Router } from 'express';
import { cacheInfo } from '../cache.js';
import { quotaInfo } from '../quota.js';
import { config } from '../config.js';

export const metaRouter = Router();

metaRouter.get('/health', (_req, res) => {
  res.json({ ok: true, coverage: config.NAVITIA_COVERAGE, uptimeSec: Math.round(process.uptime()) });
});

metaRouter.get('/quota', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ quota: quotaInfo(), cache: cacheInfo() });
});
