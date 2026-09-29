import { Router } from 'express';

/** Agrégation des trains pour la carte live (implémentée à l'étape « carte live »). */
export const liveRouter = Router();

liveRouter.get('/trains', (_req, res) => {
  res.status(501).json({ error: { code: 'not_implemented', message: 'Carte live pas encore disponible' } });
});
