import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GeoJSONSource, LayerSpecification, MapGeoJSONFeature, MapLayerMouseEvent } from 'maplibre-gl';
import maplibregl from './maplibre';
import type { FeatureCollection } from 'geojson';
import { useMap } from './MapView';
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
    return () => {
      for (const lid of ids) {
        map.off('click', lid, handleClick);
        map.off('mouseenter', lid, enter);
        map.off('mouseleave', lid, leave);
        if (map.getLayer(lid)) map.removeLayer(lid);
      }
      if (map.getSource(id)) map.removeSource(id);
    };
    // Les définitions de couches sont statiques pour un id donné
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id]);

  useEffect(() => {
    const src = map?.getSource(id) as GeoJSONSource | undefined;
    src?.setData(data);
  }, [map, id, data]);

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
    popup.on('close', () => closeRef.current?.());
    return () => {
      popup.remove();
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
