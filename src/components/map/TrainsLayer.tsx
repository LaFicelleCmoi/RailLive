import { useEffect, useRef } from 'react';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { useMap, MAP_FONT_BOLD } from './MapView';
import type { LiveTrain } from '@/api/hooks/trains';
import { interpolatePosition, type TimedStop } from '@/utils/interpolate';
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
export function TrainsLayer({
  trains,
  selected,
  onSelect,
  onFrame,
}: {
  trains: LiveTrain[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onFrame?: (visible: number) => void;
}) {
  const map = useMap();
  const prepared = useRef<Prepared[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;

  useEffect(() => {
    prepared.current = trains.map((t) => ({
      t,
      stops: t.s.map(([lon, lat, a, d]) => ({ lon, lat, a, d })),
      color: MODE_META[t.m]?.color ?? '#b8c2d3',
    }));
  }, [trains]);

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

    let raf = 0;
    let last = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - last < FRAME_MS) return;
      last = ts;
      const now = Date.now() / 1000;
      const sel = selectedRef.current;
      const features: Feature<Point>[] = [];
      for (const p of prepared.current) {
        const pos = interpolatePosition(p.stops, now);
        if (!pos || pos.state === 'arrived') continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] },
          properties: { id: p.t.id, c: p.color, dl: p.t.dl, n: p.t.n, sel: p.t.id === sel ? 1 : 0, st: pos.state },
        });
      }
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
      frameRef.current?.(features.length);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      map.off('click', 'lt-core', click);
      map.off('click', 'lt-glow', click);
      map.off('click', mapClick);
      map.off('mouseenter', 'lt-glow', enter);
      map.off('mouseleave', 'lt-glow', leave);
      for (const id of ['lt-label', 'lt-selected', 'lt-core', 'lt-delay', 'lt-glow']) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [map]);

  return null;
}
