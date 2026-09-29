import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Map as MlMap, MapMouseEvent } from 'maplibre-gl';
import maplibregl from './maplibre';
import clsx from 'clsx';
import { FRANCE_CENTER, type LngLat } from '@/utils/geo';

/** Fond de carte sombre, sans clé d'API. */
export const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
/** Pile de polices disponible sur le serveur de glyphes CARTO. */
export const MAP_FONT = ['Montserrat Regular', 'Open Sans Regular', 'Noto Sans Regular'];
export const MAP_FONT_BOLD = ['Montserrat Medium', 'Open Sans Bold', 'Noto Sans Regular'];

const MapCtx = createContext<MlMap | null>(null);

/**
 * Vrai tant que la carte n'a pas été détruite.
 * Au démontage, React nettoie <MapView> (map.remove()) AVANT ses enfants : leurs nettoyages
 * doivent donc vérifier que la carte existe encore avant d'appeler getLayer / removeSource.
 */
export function isMapAlive(map: MlMap | null | undefined): map is MlMap {
  return !!map && !!(map as unknown as { style?: unknown }).style;
}

/** Nettoyage tolérant : ignoré si la carte a déjà été détruite. */
export function safeCleanup(map: MlMap, fn: (m: MlMap) => void) {
  if (!isMapAlive(map)) return;
  try {
    fn(map);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[carte] nettoyage ignoré', err);
  }
}

/** Accès à l'instance MapLibre depuis un enfant de <MapView>. Null tant que la carte n'est pas prête. */
export function useMap(): MlMap | null {
  return useContext(MapCtx);
}

export interface MapViewProps {
  center?: LngLat;
  zoom?: number;
  bounds?: [number, number, number, number];
  className?: string;
  children?: ReactNode;
  onClick?: (lngLat: LngLat, e: MapMouseEvent) => void;
  onReady?: (map: MlMap) => void;
  interactive?: boolean;
  /** Masque le contrôle de navigation */
  bare?: boolean;
  controlsPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export function MapView({
  center = FRANCE_CENTER,
  zoom = 5,
  bounds,
  className,
  children,
  onClick,
  onReady,
  interactive = true,
  bare,
  controlsPosition = 'top-right',
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [failed, setFailed] = useState(false);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    if (!container.current) return;
    let instance: MlMap;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        style: DARK_STYLE,
        center,
        zoom,
        bounds,
        fitBoundsOptions: { padding: 40 },
        attributionControl: { compact: true, customAttribution: 'Voies © SNCF Réseau (ODbL) · Horaires API SNCF' },
        interactive,
        dragRotate: false,
        pitchWithRotate: false,
        maxZoom: 17,
        minZoom: 3,
      });
    } catch {
      setFailed(true);
      return;
    }
    if (!bare && interactive) instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), controlsPosition);
    instance.touchZoomRotate.disableRotation();
    instance.on('load', () => {
      // Si la carte a été créée dans un conteneur encore invisible (onglet masqué, transition), on recalcule sa taille
      instance.resize();
      setMap(instance);
      readyRef.current?.(instance);
    });
    instance.on('click', (e) => clickRef.current?.([e.lngLat.lng, e.lngLat.lat], e));
    instance.on('error', (e) => {
      // Les erreurs de tuiles ne doivent pas casser la page : on les signale sans interrompre le rendu
      console.warn('[carte]', e.error?.message ?? e);
    });
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(container.current);
    return () => {
      ro.disconnect();
      setMap(null);
      instance.remove();
    };
    // La carte est créée une seule fois ; les déplacements passent par l'instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={clsx('overflow-hidden bg-night-950', className)}>
      <div className="relative h-full w-full">
        {/* MapLibre impose position:relative sur ce conteneur : on le dimensionne en h/w 100 % */}
        <div ref={container} className="h-full w-full" />
        {!map && !failed && <div className="skeleton absolute inset-0 rounded-none" aria-label="Chargement de la carte" />}
        {failed && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-400">
            Votre navigateur ne prend pas en charge WebGL : la carte ne peut pas s’afficher.
          </div>
        )}
        <MapCtx.Provider value={map}>{map && children}</MapCtx.Provider>
      </div>
    </div>
  );
}
