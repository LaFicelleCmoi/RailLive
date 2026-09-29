# Déploiement

RailHub se déploie comme **un seul service Node** : en production, le proxy Express sert à la fois l’API (`/api/*`)
et le front compilé (`dist/`). Aucune clé n’est incluse dans le build du front.

## Étapes

```bash
npm ci
npm run build          # dist/ (front) + server/dist/ (proxy) + vérification des secrets
NODE_ENV=production node server/dist/index.js
```

Variables à définir sur l’hébergeur (jamais dans le dépôt) : `SNCF_API_KEY`, `ALLOWED_ORIGIN`
(l’URL publique du site, ex. `https://railhub.example.fr`), `TRUST_PROXY=1` derrière un reverse proxy,
et éventuellement `DAILY_QUOTA` / `RATE_LIMIT_PER_MINUTE`.

## Hébergeurs

- **Render / Railway / Fly.io** : service web Node, commande de build `npm ci && npm run build`,
  commande de démarrage `npm start`, variables d’environnement dans le tableau de bord. `TRUST_PROXY=1`.
- **VPS + Nginx** : `node server/dist/index.js` sous systemd ou pm2, Nginx en reverse proxy HTTPS vers `localhost:3001`,
  `TRUST_PROXY=1`. Laissez Nginx gérer TLS ; la CSP et les en-têtes de sécurité sont posés par l’application.
- **Vercel / Netlify** (front statique) : possible uniquement si le proxy est déployé séparément ;
  configurez alors une réécriture de `/api/*` vers le proxy et ajoutez l’URL du site dans `ALLOWED_ORIGIN`.

## Points d’attention

- **Réseau ferré** : au premier démarrage, le serveur télécharge ~9 Mo depuis `ressources.data.sncf.com` et les écrit
  dans `server/data/`. Le serveur doit donc pouvoir sortir sur Internet et écrire dans ce dossier (volume persistant
  recommandé). En cas d’échec, l’application fonctionne mais les trains suivent des lignes droites.

- **Une seule instance** recommandée : le cache et le compteur de quota sont en mémoire. Pour plusieurs instances,
  remplacez `server/src/cache.ts` et `server/src/quota.ts` par un stockage partagé (Redis).
- Le rate limiting utilise l’IP client : avec un reverse proxy, `TRUST_PROXY` doit être correct, sinon toutes
  les requêtes semblent venir de la même IP.
- Vérifiez après chaque build : `npm run check:secrets` (inclus dans `npm run build`) et, en production,
  que `https://<site>/assets/*.map` renvoie 404.
- Faites tourner la clé API en cas de doute (espace développeur SNCF) : seule `server/.env` / la variable d’hébergement est à changer.
