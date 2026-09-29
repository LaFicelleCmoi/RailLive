import app from './app.js';
import { config } from './config.js';
import { loadRailGraph } from './rail/graph.js';
import { log } from './utils/redact.js';

/** Serveur autonome (développement, VPS, Render…). Sur Vercel, voir api/index.js. */
app.listen(config.PORT, () => {
  log.info(`Proxy API SNCF prêt sur http://localhost:${config.PORT} (${config.NODE_ENV})`);
  // Chargement du réseau ferré en arrière-plan (les trains suivent des lignes droites en attendant)
  void loadRailGraph();
});
