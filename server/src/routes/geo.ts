import { Router } from 'express';
import { railReady, railSegment, railStats } from '../rail/graph.js';

/**
 * GET /api/geo/rail?pts=lon,lat;lon,lat;…
 * Tracé ferroviaire entre points successifs (gares). Réponse : un segment encodé par paire,
 * ou null quand le trajet n'est pas couvert par le RFN (le client trace alors une ligne droite).
 */
export const geoRouter = Router();

const PT_RE = /^-?\d{1,3}(\.\d{1,7})?,-?\d{1,2}(\.\d{1,7})?$/;

geoRouter.get('/rail', (req, res) => {
  const raw = typeof req.query.pts === 'string' ? req.query.pts : '';
  const parts = raw.split(';').filter(Boolean);
  if (parts.length < 2 || parts.length > 120 || !parts.every((p) => PT_RE.test(p))) {
    return res.status(400).json({ error: { code: 'invalid_params', message: 'pts : 2 à 120 points « lon,lat » séparés par « ; »' } });
  }
  const pts = parts.map((p) => p.split(',').map(Number) as [number, number]);
  const segments = pts.slice(1).map((b, i) => railSegment(pts[i]!, b));
  res.setHeader('Cache-Control', railReady() ? 'public, max-age=86400' : 'no-store');
  res.json({ ready: railReady(), segments });
});

geoRouter.get('/rail/status', (_req, res) => {
  res.json({ ready: railReady(), ...railStats });
});
