import { Router, type Request, type Response } from 'express';
import { cached } from '../cache.js';
import { coverageBase, coverageRoot, sncfFetch, UpstreamError } from '../sncf.js';
import {
  enforcePolicies,
  ForbiddenPathError,
  InvalidParamsError,
  parsePath,
  sanitizeQuery,
  TTL_MS,
  type ParsedPath,
} from '../whitelist.js';
import { log } from '../utils/redact.js';

export const proxyRouter = Router();

/**
 * GET /api/sncf/<chemin>?<params>
 * Le chemin et les paramètres sont validés contre une liste blanche,
 * puis l'URL de l'API SNCF est reconstruite côté serveur.
 */
proxyRouter.get(/^\/(.*)$/, async (req: Request, res: Response) => {
  const url = new URL(req.originalUrl, 'http://local');
  const rawPath = url.pathname.replace(/^\/api\/sncf/, '');

  let parsed: ParsedPath;
  let query: string;
  try {
    parsed = parsePath(rawPath);
    enforcePolicies(parsed.terminal, url.searchParams);
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

  try {
    const { value, hit } = await cached(upstreamUrl, TTL_MS[parsed.category], () => sncfFetch(upstreamUrl));

    res.setHeader('X-RailHub-Cache', hit ? 'HIT' : 'MISS');
    res.setHeader('X-RailHub-Category', parsed.category);
    res.setHeader('Cache-Control', 'private, no-store');

    if (value.status === 401 || value.status === 403) {
      log.error(`Clé API SNCF refusée (${value.status}) pour ${parsed.safePath || '/'}`);
      return res.status(502).json({
        error: { code: 'upstream_auth', message: 'Le serveur n’est pas autorisé par l’API SNCF (clé invalide ou expirée).' },
      });
    }
    if (value.status === 429) {
      return res.status(429).json({ error: { code: 'quota_exceeded', message: 'Quota de l’API SNCF atteint. Réessayez plus tard.' } });
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
