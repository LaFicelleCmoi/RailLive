# RailHub · Supervision du réseau SNCF

Application web de supervision ferroviaire construite sur l’**API SNCF** (`https://api.sncf.com/v1/coverage/sncf`) :
recherche, itinéraires, horaires temps réel, trains individuels, carte live animée, perturbations,
référentiel complet et statut des données.

- **Front** : React 18, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS v4, MapLibre GL, Recharts, Framer Motion.
- **Proxy** : Node/Express (`server/`) qui détient la clé API, filtre les requêtes et met les réponses en cache.

> Les capacités réelles de l’API SNCF (ce qui est disponible, ce qui ne l’est pas) sont documentées dans
> [`docs/API_SNCF.md`](docs/API_SNCF.md).

---

## Installation

Prérequis : **Node.js ≥ 20** (testé avec Node 24) et une clé API SNCF gratuite
([numerique.sncf.com](https://numerique.sncf.com/startup/api/token-developpeur/)).

```bash
git clone <dépôt> railhub && cd railhub
npm install                      # installe le front et le serveur (workspaces npm)
cp server/.env.example server/.env
```

Renseignez ensuite `SNCF_API_KEY` dans `server/.env`.

> Sous Windows, travaillez dans WSL (Ubuntu) plutôt que sur le chemin `\\wsl.localhost\…` depuis Windows :
> l’installation et le rechargement à chaud y sont beaucoup plus rapides.

## Variables d’environnement (`server/.env`)

| Variable | Obligatoire | Défaut | Rôle |
|---|---|---|---|
| `SNCF_API_KEY` | ✅ | — | Clé API SNCF. Lue **uniquement** par le proxy, jamais envoyée au navigateur. |
| `SNCF_API_BASE_URL` | | `https://api.sncf.com/v1` | URL de base de l’API. |
| `PORT` | | `3001` | Port du proxy (et du site en production). |
| `ALLOWED_ORIGIN` | | `http://localhost:5173` | Origines CORS autorisées (séparées par des virgules). |
| `DAILY_QUOTA` | | `5000` | Nombre d’appels amont autorisés par jour avant blocage (429). |
| `RATE_LIMIT_PER_MINUTE` | | `120` | Requêtes par minute et par IP sur `/api/sncf`. |
| `TRUST_PROXY` | | `0` | Nombre de reverse proxies devant le serveur (1 derrière Nginx, Render…). |

Le front n’utilise **aucune** variable d’environnement.

## Lancement

```bash
npm run dev          # proxy (http://localhost:3001) + front Vite (http://localhost:5173)
npm test             # tests unitaires (dates, interpolation)
npm run typecheck    # TypeScript front + serveur
npm run build        # build front + serveur + vérification des secrets
npm start            # production : le proxy sert aussi dist/ sur http://localhost:3001
```

`npm run build` se termine par `npm run check:secrets`, qui échoue si la clé API (en clair ou en base64),
une URL directe de l’API SNCF ou une source map se retrouve dans `dist/`.

## Architecture

```
railhub/
├── server/src/
│   ├── config.ts          # validation des variables d'environnement (zod)
│   ├── sncf.ts            # client API SNCF (Basic Auth, timeout, cache)
│   ├── whitelist.ts       # grammaire des chemins autorisés + schémas des paramètres + règles anti-surconsommation
│   ├── cache.ts           # LRU + TTL par catégorie + fusion des requêtes identiques
│   ├── quota.ts           # compteur d'appels du jour (heure de Paris)
│   └── routes/            # proxy (/api/sncf/*), live (/api/live/trains), insights (/api/insights/reachable), meta
├── src/
│   ├── api/               # client typé + hooks TanStack Query par module
│   ├── components/        # carte, recherche, panneau départs, timeline, calendrier, graphiques, UI
│   ├── pages/             # une page par module
│   ├── types/navitia.ts   # types des réponses (format Navitia utilisé par l'API SNCF)
│   ├── utils/             # dates (YYYYMMDDTHHMMSS, heure de Paris), interpolation, modes, géo
│   └── store/             # favoris (localStorage)
└── docs/API_SNCF.md       # matrice des capacités de l'API
```

## Modules

| # | Module | Pages | Endpoints |
|---|---|---|---|
| 1 | Recherche & géolocalisation | `/search`, `/stop-areas/:id`, barre globale | `places`, `pt_objects`, `coords/…/places_nearby`, `coords/…`, `stop_areas` |
| 2 | Itinéraires | `/journeys`, `/isochrones`, `/heatmap` | `journeys`, `isochrones`, heat map calculée par le serveur |
| 3 | Horaires | `/board`, `/schedules`, `/route-schedules`, `/terminus` | `departures`, `arrivals`, `stop_schedules`, `route_schedules`, `terminus_schedules` |
| 4 | Trains | `/train/:id`, `/trips` | `vehicle_journeys`, `vehicle_journeys?headsign=`, `trips` |
| 5 | Carte live | `/live` | `vehicle_journeys?since&until&filter` agrégé par `/api/live/trains` |
| 6 | Perturbations | `/disruptions`, `/traffic`, `/equipment`, bandeau global | `disruptions`, `traffic_reports`, `line_reports`, `equipment_reports` |
| 7 | Référentiel | `/catalog/:type`, `/lines/:id`, `/networks/:id` | `networks`, `lines`, `routes`, `stop_areas`, `stop_points`, modes, `companies` |
| 8 | Méta | `/status` | `coverage`, `status`, `datasets`, `contributors`, `/api/meta/quota` |

## Sécurité

- La clé API n’existe que dans `server/.env` (ignoré par git) ; elle est envoyée à l’API en Basic Auth et
  masquée dans tous les logs (forme brute et base64).
- Le navigateur n’appelle que `/api/*`. Le proxy accepte uniquement :
  - des chemins conformes à une **liste blanche** (collections et actions connues, identifiants validés, 3 niveaux max.) ;
  - des **paramètres** déclarés et validés un à un (zod) ; tout paramètre inconnu est refusé (400) ;
  - la méthode **GET**.
- `helmet` (CSP stricte compatible MapLibre), CORS restreint, `express-rate-limit`, erreurs sans détail interne.
- Cache mémoire avec TTL : 30 s (horaires, perturbations), 2 min (itinéraires), 10 min (isochrones), 1 h (autocomplétion), 24 h (référentiel).
- Build minifié, **sans source maps** ; le serveur renvoie 404 sur toute requête `*.map`.

## Tracés sur les voies

L’API SNCF ne fournit pas la géométrie des voies. Au démarrage, le serveur télécharge le jeu open data
**« Lignes par statut »** de SNCF Réseau (≈ 9 Mo, [licence ODbL](https://opendatacommons.org/licenses/odbl/)), le met en cache dans
`server/data/` (rafraîchi tous les 30 jours) et construit un graphe des lignes **exploitées** du Réseau Ferré National.
Pour chaque paire de gares successives, il calcule le plus court chemin sur les rails (A*), le simplifie et le met en cache.
Les trains de la carte live, la fiche train, la fiche ligne et les itinéraires suivent ainsi les vraies voies.

- `GET /api/geo/rail?pts=lon,lat;lon,lat;…` : tracés encodés (polyline) entre points successifs.
- `GET /api/geo/rail/status` : état du graphe (nœuds, tronçons, date de chargement).

## Limites connues

- **Positions estimées** : l’API SNCF ne fournit aucune position GPS. Les trains de la carte live (et la position
  affichée sur la fiche d’un train) sont placés le long des voies d’après les horaires temps réel, pas mesurés.
  Là où le RFN ne couvre pas le trajet (tronçons RATP des RER A/B, lignes étrangères, lignes non exploitées),
  le tracé retombe sur une ligne droite entre les deux gares.
- **Quota** : l’API SNCF ne renvoie pas de compteur. Le proxy compte ses propres appels (`DAILY_QUOTA`, 5 000/jour par défaut —
  ajustez selon votre abonnement). Au-delà, les réponses en cache restent servies et l’interface affiche un écran « quota atteint ».
  La carte live coûte au plus 3 appels (vue nationale) + 2 (zoom régional) par créneau de 5 minutes, partagés entre tous les visiteurs.
- **Données absentes de l’API SNCF** (voir `docs/API_SNCF.md`) : numéros de voie, heat maps natives (remplacées par un calcul serveur),
  POI, état des lignes et des équipements (affichés « non renseigné »), couleurs et géométries des lignes grandes lignes.
- La liste `/lines` est plafonnée à 1 000 résultats par l’API : filtrez par réseau dans le catalogue.
- Le cache est en mémoire : il est perdu au redémarrage et n’est pas partagé entre plusieurs instances (voir `DEPLOYMENT.md`).
