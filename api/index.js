/**
 * Point d'entrée Vercel : toutes les requêtes /api/* sont réécrites vers cette fonction (voir vercel.json).
 * L'application Express est compilée dans server/dist par `npm run build`.
 * La clé SNCF_API_KEY se configure dans les variables d'environnement du projet Vercel.
 */
export { default } from '../server/dist/app.js';
