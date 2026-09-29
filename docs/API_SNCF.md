# API SNCF : capacités réelles (sondage du 29/09/2026)

RailHub utilise exclusivement l'**API SNCF** (`https://api.sncf.com/v1/coverage/sncf`), un service
basé sur le moteur Navitia (même format de réponse). Authentification : Basic Auth, clé en nom
d'utilisateur, mot de passe vide. Aucun en-tête de quota n'est renvoyé : le proxy compte ses appels.

Données : contributeur unique `SNCF:sncf-piv`, temps réel **chargé** (`realtime.sncf.piv`),
production sur ~1 mois glissant, 30 réseaux, 4 179 zones d'arrêt, 6 502 points d'arrêt, ~392 000 trips.

## Disponible ✅

| Endpoint | Usage RailHub | Remarques |
|---|---|---|
| `/coverage`, `/status`, `/datasets`, `/contributors` | Page Statut | `status` expose `is_realtime_loaded`, `last_rt_data_loaded` |
| `/places?q=` | Recherche globale | gares, villes (`administrative_region`), **adresses** (`type[]=address`) |
| `/pt_objects?q=` | Recherche lignes/réseaux | |
| `/coords/{lon;lat}` | Géocodage inverse | |
| `/coords/{lon;lat}/places_nearby` | Autour de moi | |
| `/stop_areas/{id}` | Fiche gare | codes **UIC**, `secondary_id`, `source` |
| `/stop_areas/{id}/lines`, `/lines/{id}/stop_areas`, `/networks/{id}/lines`, `/commercial_modes/{id}/lines` | Navigation référentiel | |
| `/departures`, `/arrivals` | Panneau gare | `display_informations` complet (trip_short_name, réseau, direction) |
| `/stop_schedules`, `/terminus_schedules` | Horaires | |
| `/route_schedules` | Grille de ligne | ⚠️ **non borné = 11 Mo** → le proxy impose `from_datetime` + `duration` |
| `/vehicle_journeys/{id}` | Page train | `stop_times` avec coordonnées, `calendars`, `validity_pattern` |
| `/vehicle_journeys?since=&until=` | Carte live | filtrable par `physical_modes/{id}/…` et `coords/{lon;lat}/…?distance=` |
| `/trips`, `/trips/{id}` | Circulations | |
| `/journeys` | Itinéraires | géométrie des sections ✅, CO₂ ✅, `forbidden_uris[]` ✅, départ depuis ville/adresse ✅, `is_journey_schedules` ✅ |
| `/journeys?from=` (sans `to`) | **Heat map maison** | ~500 destinations en 2 h, 8 Mo → agrégé côté serveur |
| `/isochrones` | Isochrones | ✅ natif, polygones lourds (≈2,4 Mo pour 3 bornes) |
| `/disruptions` | Perturbations | ~6 000 éléments ; `cause` souvent vide → le motif est dans `messages` / `impacted_stops[].cause` |
| `/traffic_reports` | État du trafic | regroupé par réseau, surtout des `vehicle_journeys` impactés |
| `/networks`, `/lines`, `/routes`, `/stop_areas`, `/stop_points`, `/commercial_modes`, `/physical_modes`, `/companies` | Catalogue | `/lines` plafonné à 1 000 résultats → filtrer par réseau/mode |

## Indisponible ❌ (géré dans l'UI)

| Endpoint | Réponse | Remplacement |
|---|---|---|
| `/heat_maps` | `no street network data` | Heat map calculée à partir de `/journeys` sans destination |
| `/pois`, `/poi_types` | 404 `unknown_object` | Masqués du catalogue |
| `/calendars` (collection) | 404 | Calendrier lu dans `vehicle_journeys[].calendars` |
| `/line_groups` | 404 | — |
| `/line_reports` | `no_solution` (vide) | Message « non renseigné » + `traffic_reports` |
| `/equipment_reports` | 404 « no equipment provider » | Message « non renseigné » |
| `freefloatings_nearby` | 404 | — |
| Géométrie des lignes (`geojson`) | toujours vide | Tracé reconstruit à partir des arrêts successifs |
| Couleurs officielles des lignes | vides pour les trains | Couleurs par mode commercial (TGV INOUI, OUIGO, TER…) |
| Voie / quai | non fournie | Colonne « Voie » affichée « — » |

## Volumes utiles (fenêtre −90 min / +30 min, un mardi 7 h)

| Mode physique | Circulations |
|---|---|
| `LongDistanceTrain` (TGV, Intercités, OUIGO) | 268 |
| `Train` (TER) | 1 340 |
| `RapidTransit` (RER / Transilien) | 640 |
| `Coach` | 474 |

100 circulations en `depth=1` ≈ 555 Ko. La carte live charge donc les grandes lignes à l'échelle
nationale et le reste seulement au zoom (requête par rayon), avec un cache serveur partagé.
