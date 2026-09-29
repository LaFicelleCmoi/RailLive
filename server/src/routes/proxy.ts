import { Router, type Request, type Response } from 'express';
import { cached } from '../cache.js';
import { coverageBase, coverageRoot, navitiaFetch, UpstreamError } from '../navitia.js';
import { localQuotaReached } from '../quota.js';
import { ForbiddenPathError, InvalidParamsError, parsePath, sanitizeQuery, TTL_MS } from '../whitelist.js';
import { log } from '../utils/redact.js';

export const proxyRouter = Router();

/**
 * GET /api/navitia/<chemin>?<params>
 * Le chemin et les paramètres sont validés contre une liste blanche,
 * puis l'URL amont est reconstruite côté serveur.
 */
proxyRouter.get(/^\/(.*)$/, async (req: Request, res: Response) => {
  const url = new URL(req.originalUrl, 'http://local');
  const rawPath = url.pathname.replace(/^\/api\/navitia/, '');

  let parsed;
  let query: string;
  try {
    parsed = parsePath(rawPath);
    query = sanitizeQuery(url.searchParams);
  } catch (err) {
    if (err instanceof ForbiddenPathError) {
      return res.status(403).json({ error: { code: 'forbidden_endpoint', message: err.message } });
    }
    if (err instanceof InvalidParamsError) {
      return res.status(400).json({ error: { code: 'invalid_params', message: err.message, details: err.issues } });
    }
    throw err;
  }

  const base = parsed.root ? coverageRoot : coverageBase;
  const upstreamUrl = `${base}${parsed.safePath ? `/${parsed.safePath}` : ''}${query ? `?${query}` : ''}`;
  const ttl = TTL_MS[parsed.category];

  try {
    const { value, hit } = await cached(upstreamUrl, ttl, () => {
      if (localQuotaReached()) {
        throw new UpstreamError(429, 'quota_exceeded', 'Quota journalier du proxy atteint');
      }
      return navitiaFetch(upstreamUrl);
    });

    res.setHeader('X-RailHub-Cache', hit ? 'HIT' : 'MISS');
    res.setHeader('X-RailHub-Category', parsed.category);
    res.setHeader('Cache-Control', 'private, no-store');

    if (value.status === 401 || value.status === 403) {
      log.error(`Authentification Navitia refusée (${value.status}) pour ${parsed.safePath || '/'}`);
      return res.status(502).json({
        error: { code: 'upstream_auth', message: 'Le serveur n’est pas autorisé par Navitia (token invalide ou expiré).' },
      });
    }
    if (value.status === 429) {
      return res.status(429).json({ error: { code: 'quota_exceeded', message: 'Quota Navitia atteint. Réessayez plus tard.' } });
    }

    res.status(value.status).type('application/json').send(value.body);
  } catch (err) {
    if (err instanceof UpstreamError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    log.error('Erreur proxy', err);
    res.status(500).json({ error: { code: 'internal', message: 'Erreur interne du proxy' } });
  }
});
