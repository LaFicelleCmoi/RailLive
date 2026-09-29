import { useEffect, useRef } from 'react';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { isMapAlive, safeCleanup, useMap, MAP_FONT_BOLD } from './MapView';
import type { LiveTrain } from '@/api/hooks/trains';
import { interpolatePosition, preparePath, type PreparedPath, type TimedStop } from '@/utils/interpolate';
import { decodePolyline } from '@/utils/polyline';
import { RailSnapper, SNAP_MIN_ZOOM, SNAP_RADIUS_APPROX_M, SNAP_RADIUS_M } from './railSnap';
import { MODE_META } from '@/utils/modes';

const SOURCE = 'live-trains';
/** ~12 images/s : largement suffisant pour des trains, et économe en CPU. */
const FRAME_MS = 80;

interface Prepared {
  t: LiveTrain;
  stops: TimedStop[];
  color: string;
}

/**
 * Couche des trains animés. Les positions sont calculées côté client à chaque image
 * (requestAnimationFrame) par interpolation entre deux gares ; aucune requête réseau par image.
 */
/** Tracé préparé du tronçon i → i+1 d'un train (undefined = ligne droite). */
export function pathFor(t: LiveTrain, i: number, segments: string[] | undefined, cache: Map<string, PreparedPath | undefined>) {
  const idx = t.p?.[i];
  const enc = idx !== undefined && idx >= 0 ? segments?.[idx] : undefined;
  if (!enc) return undefined;
  if (!cache.has(enc)) cache.set(enc, preparePath(decodePolyline(enc)));
  return cache.get(enc);
}

export function TrainsLayer({
  trains,
  segments,
  selected,
  onSelect,
  onFrame,
}: {
  trains: LiveTrain[];
  segments?: string[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onFrame?: (visible: number) => void;
}) {
  const map = useMap();
  const prepared = useRef<Prepared[]>([]);
  /** Tracés décodés, conservés d'un rafraîchissement à l'autre (clé : polyligne encodée) */
  const pathCache = useRef(new Map<string, PreparedPath | undefined>());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;

  useEffect(() => {
    prepared.current = trains.map((t) => ({
      t,
      stops: t.s.map(([lon, lat, a, d], i) => ({ lon, lat, a, d, path: pathFor(t, i, segments, pathCache.current) })),
      color: MODE_META[t.m]?.color ?? '#b8c2d3',
    }));
  }, [trains, segments]);

  useEffect(() => {
    if (!map) return;
    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
    map.addSource(SOURCE, { type: 'geojson', data: empty });
    map.addLayer({
      id: 'lt-glow',
      type: 'circle',
      source: SOURCE,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 8, 11, 12, 16],
        'circle-color': ['get', 'c'],
        'circle-opacity': 0.16,
        'circle-blur': 0.7,
      },
    });
    map.addLayer({
      id: 'lt-delay',
      type: 'circle',
      source: SOURCE,
      filter: ['>', ['get', 'dl'], 0],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5.5, 8, 8, 12, 10.5],
        'circle-opacity': 0,
        'circle-stroke-width': 1.6,
        'circle-stroke-color': ['case', ['>=', ['get', 'dl'], 5], '#f8716c', '#f7c257'],
      },
    });
    map.addLayer({
      id: 'lt-core',
      type: 'circle',
      source: SOURCE,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 8, 5, 12, 7],
        'circle-color': ['get', 'c'],
        'circle-stroke-color': '#05080f',
        'circle-stroke-width': 1.2,
      },
    });
    map.addLayer({
      id: 'lt-selected',
      type: 'circle',
      source: SOURCE,
      filter: ['==', ['get', 'sel'], 1],
      paint: { 'circle-radius': 13, 'circle-opacity': 0, 'circle-stroke-width': 2, 'circle-stroke-color': '#f4f6fa' },
    });
    map.addLayer({
      id: 'lt-label',
      type: 'symbol',
      source: SOURCE,
      minzoom: 8.5,
      layout: {
        'text-field': ['get', 'n'],
        'text-size': 10,
        'text-offset': [0, 1.25],
        'text-anchor': 'top',
        'text-font': MAP_FONT_BOLD,
        'text-allow-overlap': false,
      },
      paint: { 'text-color': '#e9edf3', 'text-halo-color': '#05080f', 'text-halo-width': 1.4 },
    });

    const click = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) {
        e.preventDefault();
        selectRef.current(id);
      }
    };
    const mapClick = (e: { defaultPrevented: boolean }) => {
      if (!e.defaultPrevented) selectRef.current(null);
    };
    const enter = () => (map.getCanvas().style.cursor = 'pointer');
    const leave = () => (map.getCanvas().style.cursor = '');
    map.on('click', 'lt-core', click);
    map.on('click', 'lt-glow', click);
    map.on('click', mapClick);
    map.on('mouseenter', 'lt-glow', enter);
    map.on('mouseleave', 'lt-glow', leave);

    // Voies OSM du fond de carte : relues au fil de l'arrivée des tuiles, y compris pendant un zoom
    // (limité à une lecture toutes les 200 ms), puis à la fin de chaque déplacement.
    const snapper = new RailSnapper();
    /** Dernière position aimantée de chaque train (continuité d'une image à l'autre) */
    const lastSnap = new Map<string, [number, number]>();
    let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
    let lastRebuild = 0;
    const rebuild = () => {
      rebuildTimer = undefined;
      lastRebuild = performance.now();
      if (isMapAlive(map)) snapper.rebuild(map);
    };
    const scheduleRebuild = () => {
      if (rebuildTimer) return;
      rebuildTimer = setTimeout(rebuild, Math.max(0, 200 - (performance.now() - lastRebuild)));
    };
    const onSourceData = (e: { sourceId?: string; tile?: unknown }) => {
      if (e.sourceId === 'carto' && e.tile) scheduleRebuild();
    };
    map.on('sourcedata', onSourceData);
    map.on('moveend', scheduleRebuild);
    scheduleRebuild();

    let raf = 0;
    let last = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - last < FRAME_MS) return;
      last = ts;
      if (!isMapAlive(map)) return;
      const now = Date.now() / 1000;
      const sel = selectedRef.current;
      const zoom = map.getZoom();
      const snapping = snapper.active && zoom >= SNAP_MIN_ZOOM;
      if (!snapping) lastSnap.clear();
      const features: Feature<Point>[] = [];
      for (const p of prepared.current) {
        const pos = interpolatePosition(p.stops, now);
        if (!pos || pos.state === 'arrived') continue;
        // Colle le train à la voie dessinée par la carte. Sur un tronçon sans tracé ferroviaire (ligne droite
        // de secours, ex. RER sur infrastructure RATP), la position est approximative : rayon élargi.
        const approximate = pos.state === 'running' && !p.stops[pos.index]?.path;
        let snapped: [number, number] | null = null;
        if (snapping) {
          snapped = snapper.snap(pos.lon, pos.lat, pos.bearing, approximate ? SNAP_RADIUS_APPROX_M : SNAP_RADIUS_M, lastSnap.get(p.t.id));
          if (snapped) lastSnap.set(p.t.id, snapped);
          else lastSnap.delete(p.t.id);
        }
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: snapped ?? [pos.lon, pos.lat] },
          properties: { id: p.t.id, c: p.color, dl: p.t.dl, n: p.t.n, sel: p.t.id === sel ? 1 : 0, st: pos.state },
        });
      }
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
      frameRef.current?.(features.length);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rebuildTimer);
      safeCleanup(map, (m) => {
        m.off('sourcedata', onSourceData);
        m.off('moveend', scheduleRebuild);
        m.off('click', 'lt-core', click);
        m.off('click', 'lt-glow', click);
        m.off('click', mapClick);
        m.off('mouseenter', 'lt-glow', enter);
        m.off('mouseleave', 'lt-glow', leave);
        for (const id of ['lt-label', 'lt-selected', 'lt-core', 'lt-delay', 'lt-glow']) if (m.getLayer(id)) m.removeLayer(id);
        if (m.getSource(SOURCE)) m.removeSource(SOURCE);
      });
    };
  }, [map]);

  return null;
}
