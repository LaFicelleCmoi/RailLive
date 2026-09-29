import { Router } from 'express';
import { z } from 'zod';
import { sncfJson, UpstreamError } from '../sncf.js';
import { parisNow } from '../whitelist.js';
import { log } from '../utils/redact.js';

/**
 * Agrégations calculées côté serveur à partir de l'API SNCF.
 * GET /api/insights/reachable : « heat map » des temps de trajet depuis une gare.
 * L'API SNCF ne fournit pas /heat_maps (pas de réseau viaire) : on utilise /journeys
 * sans destination, qui renvoie toutes les gares atteignables (~8 Mo), puis on
 * réduit la réponse à quelques Ko.
 */
export const insightsRouter = Router();

const Query = z.object({
  from: z.string().regex(/^stop_area:[\w:.-]{1,120}$/, 'from doit être une zone d’arrêt (stop_area:…)'),
  max_duration: z.coerce.number().int().min(900).max(4 * 3600).default(7200),
  datetime: z
    .string()
    .regex(/^\d{8}T\d{4}(\d{2})?$/)
    .optional(),
});

interface Section {
  type: string;
  display_informations?: { commercial_mode?: string };
}
interface ReachJourney {
  duration: number;
  nb_transfers: number;
  departure_date_time: string;
  arrival_date_time: string;
  to?: PlaceLike;
  sections?: (Section & { to?: PlaceLike })[];
}
interface PlaceLike {
  id: string;
  name: string;
  stop_point?: { id: string; name: string; coord?: { lon: string; lat: string } };
  stop_area?: { id: string; name: string; coord?: { lon: string; lat: string } };
}

/** Arrondit une date YYYYMMDDTHHMMSS au quart d'heure inférieur (meilleure réutilisation du cache). */
function roundQuarter(dt: string): string {
  const mm = Math.floor(Number(dt.slice(11, 13)) / 15) * 15;
  return `${dt.slice(0, 11)}${String(mm).padStart(2, '0')}00`;
}

insightsRouter.get('/reachable', async (req, res) => {
  const parsed = Query.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'invalid_params', message: 'Paramètres invalides', details: parsed.error.issues.map((i) => i.message) },
    });
  }
  const { from, max_duration } = parsed.data;
  const datetime = roundQuarter(parsed.data.datetime ?? parisNow());

  try {
    const data = await sncfJson<{ journeys?: ReachJourney[]; error?: { id: string; message: string } }>(
      'journeys',
      { from, max_duration: String(max_duration), datetime, depth: '0', disable_geojson: 'true' },
      30 * 60_000,
    );
    if (data.error && !data.journeys) {
      return res.status(404).json({ error: { code: data.error.id, message: data.error.message } });
    }

    const best = new Map<string, { name: string; lon: number; lat: number; duration: number; transfers: number; modes: Set<string> }>();
    for (const j of data.journeys ?? []) {
      const dest = j.to ?? j.sections?.at(-1)?.to;
      const obj = dest?.stop_point ?? dest?.stop_area;
      const lon = Number(obj?.coord?.lon);
      const lat = Number(obj?.coord?.lat);
      if (!obj || !Number.isFinite(lon) || !Number.isFinite(lat) || (lon === 0 && lat === 0)) continue;
      // Regroupe les points d'arrêt d'une même gare par nom
      const name = (obj.name ?? dest?.name ?? '').replace(/\s*\([^)]*\)\s*$/, '');
      const key = name.toLowerCase();
      const modes = new Set((j.sections ?? []).map((s) => s.display_informations?.commercial_mode).filter((m): m is string => !!m));
      const prev = best.get(key);
      if (!prev || j.duration < prev.duration) best.set(key, { name, lon, lat, duration: j.duration, transfers: j.nb_transfers, modes });
    }

    const points = [...best.values()]
      .sort((a, b) => a.duration - b.duration)
      .map((p) => ({ name: p.name, lon: +p.lon.toFixed(5), lat: +p.lat.toFixed(5), duration: p.duration, transfers: p.transfers, modes: [...p.modes] }));

    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json({ from, datetime, max_duration, count: points.length, points });
  } catch (err) {
    if (err instanceof UpstreamError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    log.error('insights/reachable', err);
    res.status(500).json({ error: { code: 'internal', message: 'Erreur interne' } });
  }
});
