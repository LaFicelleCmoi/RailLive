import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GeoJSONSource, LayerSpecification, MapGeoJSONFeature, MapLayerMouseEvent } from 'maplibre-gl';
import maplibregl from './maplibre';
import type { FeatureCollection } from 'geojson';
import { isMapAlive, safeCleanup, useMap } from './MapView';
import type { LngLat } from '@/utils/geo';

export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Omit distributif : conserve les propriétés propres à chaque type de couche (filter, minzoom…). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type LayerDef = DistributiveOmit<Exclude<LayerSpecification, { type: 'background' }>, 'source'>;

/**
 * Source GeoJSON + couches associées. Les couches sont créées une fois,
 * puis seules les données sont mises à jour (setData).
 */
export function GeoJsonLayer({
  id,
  data,
  layers,
  beforeId,
  onClick,
  cursor = true,
}: {
  id: string;
  data: FeatureCollection;
  layers: LayerDef[];
  beforeId?: string;
  onClick?: (feature: MapGeoJSONFeature, e: MapLayerMouseEvent) => void;
  cursor?: boolean;
}) {
  const map = useMap();
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!map) return;
    map.addSource(id, { type: 'geojson', data, promoteId: 'id' });
    for (const layer of layers) {
      map.addLayer({ ...layer, source: id } as LayerSpecification, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
    }
    const ids = layers.map((l) => l.id);
    const handleClick = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (f && clickRef.current) {
        e.preventDefault();
        clickRef.current(f, e);
      }
    };
    const enter = () => (map.getCanvas().style.cursor = 'pointer');
    const leave = () => (map.getCanvas().style.cursor = '');
    for (const lid of ids) {
      map.on('click', lid, handleClick);
      if (cursor && clickRef.current) {
        map.on('mouseenter', lid, enter);
        map.on('mouseleave', lid, leave);
      }
    }
    return () =>
      safeCleanup(map, (m) => {
        for (const lid of ids) {
          m.off('click', lid, handleClick);
          m.off('mouseenter', lid, enter);
          m.off('mouseleave', lid, leave);
          if (m.getLayer(lid)) m.removeLayer(lid);
        }
        if (m.getSource(id)) m.removeSource(id);
      });
    // Les définitions de couches sont statiques pour un id donné
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id]);

  useEffect(() => {
    if (!isMapAlive(map)) return;
    (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }, [map, id, data]);

  return null;
}

/**
 * Voies ferrées OSM du fond de carte, rendues dès le zoom 9 (le style CARTO ne les dessine qu'à partir de 13).
 * Ce sont ces voies sur lesquelles les trains sont aimantés.
 */
export function BasemapRailLayer({ minzoom = 9 }: { minzoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !map.getSource('carto')) return;
    const id = 'basemap-rail';
    map.addLayer({
      id,
      type: 'line',
      source: 'carto',
      'source-layer': 'transportation',
      minzoom,
      maxzoom: 13,
      filter: ['all', ['==', ['get', 'class'], 'rail'], ['!', ['in', ['get', 'service'], ['literal', ['yard', 'siding', 'spur', 'crossover']]]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#5a6780',
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 13, 1.6],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 11, 0.85],
      },
    } as LayerSpecification);
    return () => safeCleanup(map, (m) => m.getLayer(id) && m.removeLayer(id));
  }, [map, minzoom]);
  return null;
}

/** Ajuste la vue sur un ensemble de points dès qu'il change. */
export function FitBounds({
  points,
  padding = 60,
  maxZoom = 12,
}: {
  points: LngLat[];
  padding?: number | { top: number; bottom: number; left: number; right: number };
  maxZoom?: number;
}) {
  const map = useMap();
  const key = points.length ? `${points.length}:${points[0]}:${points[points.length - 1]}` : '';
  useEffect(() => {
    if (!map || !points.length) return;
    if (points.length === 1) {
      map.flyTo({ center: points[0]!, zoom: Math.min(maxZoom, 13), duration: 800 });
      return;
    }
    const b = new maplibregl.LngLatBounds(points[0]!, points[0]!);
    points.forEach((p) => b.extend(p));
    map.fitBounds(b, { padding, maxZoom, duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** Popup contrôlée : le contenu React est rendu dans la bulle via un portail. */
export function Popup({ at, children, onClose }: { at: LngLat | null; children: ReactNode; onClose?: () => void }) {
  const map = useMap();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [el] = useState(() => document.createElement('div'));
  useEffect(() => {
    if (!map || !at) return;
    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '320px', offset: 12 }).setLngLat(at).setDOMContent(el).addTo(map);
    const onClose = () => closeRef.current?.();
    popup.on('close', onClose);
    return () => {
      // Retrait programmatique : ne pas propager comme une fermeture utilisateur
      popup.off('close', onClose);
      if (isMapAlive(map)) popup.remove();
    };
  }, [map, at, el]);
  return at ? createPortal(children, el) : null;
}

/** Points → FeatureCollection */
export function pointsFC<T extends Record<string, unknown>>(items: { id: string; lngLat: LngLat; props?: T }[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items.map((it) => ({
      type: 'Feature',
      id: it.id,
      geometry: { type: 'Point', coordinates: it.lngLat },
      properties: { id: it.id, ...(it.props ?? {}) },
    })),
  };
}
