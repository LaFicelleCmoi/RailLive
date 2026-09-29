import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Crosshair, LocateFixed, MapPin, MousePointerClick, Navigation, TrainFront } from 'lucide-react';
import clsx from 'clsx';
import { MAP_FONT, MapView, useMap } from '@/components/map/MapView';
import { FitBounds, GeoJsonLayer, Popup, pointsFC, EMPTY_FC } from '@/components/map/layers';
import { SidePanel, useMapPadding } from '@/components/ui/SidePanel';
import { Button } from '@/components/ui/Button';
import { ErrorState, SkeletonRows, EmptyState } from '@/components/ui/States';
import { PlaceAutocomplete, type PickedPlace } from '@/components/SearchBox/PlaceAutocomplete';
import { usePlacesNearby, useReverseGeocode } from '@/api/hooks/search';
import { formatDistance, haversine, toLngLat, type LngLat } from '@/utils/geo';

const DISTANCES = [1000, 2000, 5000, 10_000];

function FlyTo({ to, zoom = 13 }: { to: LngLat | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (map && to) map.flyTo({ center: to, zoom: Math.max(map.getZoom(), zoom), duration: 900 });
  }, [map, to, zoom]);
  return null;
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const urlCenter = useMemo<LngLat | null>(() => {
    const lon = Number(params.get('lon'));
    const lat = Number(params.get('lat'));
    return params.get('lon') && Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
  }, [params]);
  const label = params.get('label');

  const [distance, setDistance] = useState(2000);
  const [clicked, setClicked] = useState<LngLat | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const mapPadding = useMapPadding();

  const nearby = usePlacesNearby(urlCenter, distance);
  const reverse = useReverseGeocode(clicked);

  const setCenter = (p: LngLat, name?: string) => {
    const next = new URLSearchParams({ lon: p[0].toFixed(6), lat: p[1].toFixed(6) });
    if (name) next.set('label', name);
    setParams(next, { replace: false });
  };

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setGeoError('La géolocalisation n’est pas disponible sur ce navigateur.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setCenter([pos.coords.longitude, pos.coords.latitude], 'Ma position');
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Autorisation de localisation refusée. Cliquez sur la carte pour choisir un point.'
            : 'Position introuvable. Réessayez ou cliquez sur la carte.',
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const onPick = (p: PickedPlace | null) => {
    if (!p) return;
    if (p.type === 'stop_area') return navigate(`/stop-areas/${encodeURIComponent(p.id)}`);
    if (p.lngLat) setCenter(p.lngLat, p.name);
  };

  const stations = useMemo(
    () =>
      (nearby.data ?? [])
        .map((p) => {
          const ll = toLngLat(p.stop_area?.coord);
          return ll ? { id: p.id, name: p.stop_area?.name ?? p.name, lngLat: ll, dist: urlCenter ? haversine(urlCenter, ll) : Number(p.distance ?? 0) } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => a.dist - b.dist),
    [nearby.data, urlCenter],
  );

  const stationsFC = useMemo(
    () => pointsFC(stations.map((s) => ({ id: s.id, lngLat: s.lngLat, props: { name: s.name, hover: s.id === hovered ? 1 : 0 } }))),
    [stations, hovered],
  );
  const centerFC = useMemo(() => (urlCenter ? pointsFC([{ id: 'center', lngLat: urlCenter }]) : EMPTY_FC), [urlCenter]);
  const radiusFC = useMemo(() => (urlCenter ? circleFC(urlCenter, distance) : EMPTY_FC), [urlCenter, distance]);

  return (
    <div className="relative h-full">
      <MapView className="absolute inset-0" onClick={(ll) => setClicked(ll)} zoom={5}>
        <GeoJsonLayer
          id="radius"
          data={radiusFC}
          layers={[
            { id: 'radius-fill', type: 'fill', paint: { 'fill-color': '#4fd3ea', 'fill-opacity': 0.05 } },
            { id: 'radius-line', type: 'line', paint: { 'line-color': '#4fd3ea', 'line-opacity': 0.35, 'line-width': 1, 'line-dasharray': [2, 2] } },
          ]}
        />
        <GeoJsonLayer
          id="stations"
          data={stationsFC}
          onClick={(f) => navigate(`/stop-areas/${encodeURIComponent(String(f.properties.id))}`)}
          layers={[
            {
              id: 'stations-halo',
              type: 'circle',
              paint: { 'circle-radius': ['case', ['==', ['get', 'hover'], 1], 16, 11], 'circle-color': '#4fd3ea', 'circle-opacity': 0.14 },
            },
            {
              id: 'stations-dot',
              type: 'circle',
              paint: { 'circle-radius': 5, 'circle-color': '#0e1524', 'circle-stroke-color': '#4fd3ea', 'circle-stroke-width': 2 },
            },
            {
              id: 'stations-label',
              type: 'symbol',
              minzoom: 11,
              layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-font': MAP_FONT },
              paint: { 'text-color': '#e9edf3', 'text-halo-color': '#05080f', 'text-halo-width': 1.4 },
            },
          ]}
        />
        <GeoJsonLayer
          id="center"
          data={centerFC}
          layers={[
            { id: 'center-pulse', type: 'circle', paint: { 'circle-radius': 14, 'circle-color': '#f7c257', 'circle-opacity': 0.18 } },
            { id: 'center-dot', type: 'circle', paint: { 'circle-radius': 6, 'circle-color': '#f7c257', 'circle-stroke-color': '#05080f', 'circle-stroke-width': 2 } },
          ]}
        />
        {urlCenter && <FlyTo to={urlCenter} />}
        {stations.length > 0 && (
          <FitBounds
            points={[...(urlCenter ? [urlCenter] : []), ...stations.map((s) => s.lngLat)]}
            maxZoom={14}
            padding={mapPadding}
          />
        )}
        <Popup at={clicked} onClose={() => setClicked(null)}>
          <div className="w-60">
            <p className="eyebrow mb-1 text-[10px]">Point sélectionné</p>
            {reverse.isLoading ? (
              <div className="skeleton h-4 w-44" />
            ) : (
              <p className="text-sm font-medium text-ink-50">{reverse.data?.address?.label ?? 'Adresse inconnue'}</p>
            )}
            <p className="mt-1 font-mono text-[11px] text-ink-500">
              {clicked?.[1].toFixed(5)}, {clicked?.[0].toFixed(5)}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="primary"
                icon={<Crosshair className="size-3.5" />}
                onClick={() => {
                  if (clicked) setCenter(clicked, reverse.data?.address?.label ?? 'Point choisi');
                  setClicked(null);
                }}
              >
                Gares proches
              </Button>
              {reverse.data?.address && (
                <Button
                  size="sm"
                  icon={<Navigation className="size-3.5" />}
                  onClick={() => navigate(`/journeys?from=${encodeURIComponent(reverse.data!.address!.id)}&fromName=${encodeURIComponent(reverse.data!.address!.label ?? '')}`)}
                >
                  Partir d’ici
                </Button>
              )}
            </div>
          </div>
        </Popup>
      </MapView>

      <SidePanel
        header={
          <div className="space-y-3 border-b border-white/[0.06] p-4">
            <div>
              <p className="eyebrow mb-1 text-[10px]">Module 1 · Recherche & géolocalisation</p>
              <h1 className="text-lg font-semibold text-ink-50">Explorer le réseau</h1>
            </div>
            <PlaceAutocomplete value={null} onChange={onPick} placeholder="Gare, ville ou adresse…" />
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" loading={locating} icon={<LocateFixed className="size-3.5" />} onClick={locate}>
                Autour de moi
              </Button>
              <div className="ml-auto flex rounded-lg border border-white/[0.08] p-0.5" role="radiogroup" aria-label="Rayon">
                {DISTANCES.map((d) => (
                  <button
                    key={d}
                    role="radio"
                    aria-checked={d === distance}
                    onClick={() => setDistance(d)}
                    className={clsx(
                      'rounded-md px-2 py-1 font-mono text-[11px] transition-colors',
                      d === distance ? 'bg-white/10 text-ink-50' : 'text-ink-500 hover:text-ink-200',
                    )}
                  >
                    {d / 1000} km
                  </button>
                ))}
              </div>
            </div>
            {geoError && <p className="text-xs text-wait-300">{geoError}</p>}
          </div>
        }
      >
        {!urlCenter ? (
          <EmptyState
            icon={<MousePointerClick className="size-5" />}
            title="Choisissez un point de départ"
            description="Utilisez « Autour de moi », recherchez un lieu ou cliquez sur la carte pour afficher son adresse et les gares proches."
          />
        ) : (
          <div className="p-3">
            <div className="mb-2 flex items-center gap-2 px-2 text-xs text-ink-400">
              <MapPin className="size-3.5 text-wait-400" />
              <span className="truncate">{label ?? 'Point choisi'}</span>
              <span className="ml-auto shrink-0 font-mono text-ink-500">{stations.length} gare(s)</span>
            </div>
            {nearby.isLoading && <SkeletonRows rows={5} />}
            {nearby.isError && <ErrorState error={nearby.error} onRetry={() => nearby.refetch()} />}
            {nearby.isSuccess && stations.length === 0 && (
              <EmptyState
                icon={<TrainFront className="size-5" />}
                title="Aucune gare dans ce rayon"
                description="Élargissez le rayon de recherche."
                action={
                  distance < 10_000 && (
                    <Button size="sm" onClick={() => setDistance(DISTANCES[DISTANCES.indexOf(distance) + 1] ?? 10_000)}>
                      Élargir
                    </Button>
                  )
                }
              />
            )}
            <ul className="space-y-1">
              {stations.map((s, i) => (
                <motion.li
                  key={s.id}
                  initial={{ opacity: 0, x: i % 2 ? 12 : -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.4) }}
                  onPointerEnter={() => setHovered(s.id)}
                  onPointerLeave={() => setHovered(null)}
                >
                  <Link
                    to={`/stop-areas/${encodeURIComponent(s.id)}`}
                    className="group flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-white/[0.05]"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-info-500/10 text-info-400">
                      <TrainFront className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-100">{s.name}</span>
                      <span className="font-mono text-[11px] text-ink-500">{formatDistance(s.dist)}</span>
                    </span>
                    <ArrowRight className="size-4 text-ink-600 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-300" />
                  </Link>
                </motion.li>
              ))}
            </ul>
          </div>
        )}
      </SidePanel>
    </div>
  );
}

/** Cercle géodésique approximatif (polygone à 64 côtés). */
function circleFC(center: LngLat, radiusM: number) {
  const pts: LngLat[] = [];
  const latR = radiusM / 111_320;
  const lonR = radiusM / (111_320 * Math.cos((center[1] * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([center[0] + lonR * Math.cos(a), center[1] + latR * Math.sin(a)]);
  }
  return {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [pts] } }],
  };
}
