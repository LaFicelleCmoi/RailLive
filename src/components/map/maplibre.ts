/**
 * Point d'entrée unique de MapLibre.
 *
 * On utilise la variante « CSP » : le worker est un fichier séparé servi depuis notre origine
 * (au lieu d'un worker blob généré à partir du code source de la librairie). Cela évite qu'il soit
 * cassé par le bundling de production, et reste compatible avec une CSP stricte (sans eval).
 */
import maplibregl from 'maplibre-gl/dist/maplibre-gl-csp';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url';

maplibregl.setWorkerUrl(workerUrl);

export default maplibregl;
