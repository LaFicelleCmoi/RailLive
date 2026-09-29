import { useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import { Target } from 'lucide-react';
import { MapView } from '@/components/map/MapView';
import { EMPTY_FC, FitBounds, GeoJsonLayer, pointsFC } from '@/components/map/layers';
import { SidePanel, useMapPadding } from '@/components/ui/SidePanel';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { FilterChip } from '@/components/ui/Segmented';
import { OriginControls, useOrigin } from '@/components/OriginControls';
import { useIsochrones } from '@/api/hooks/journeys';
import { useStopArea } from '@/api/hooks/search';
import { toLngLat, type LngLat } from '@/utils/geo';
import { formatDuration } from '@/utils/navitiaDate';

const PRESETS = [1800, 3600, 5400, 7200, 10800];
/** Rampe séquentielle (proche → loin) */
const RAMP = ['#4fd3ea', '#4f9dea', '#8a7cf0', '#c47ad6', '#f7c257'];

export default function IsochronesPage() {
  const { from, datetime, params, set } = useOrigin();
  const bounds = useMemo(() => {
    const raw = params.get('b');
    const list = raw ? raw.split(',').map(Number).filter((n) => PRESETS.includes(n)) : [3600, 7200];
    return [...new Set(list)].sort((a, b) => a - b).slice(0, 4);
  }, [params]);
  const iso = useIsochrones(from, bounds, datetime);
  const sa = useStopArea(from);
  const origin = toLngLat(sa.data?.coord);
  const mapPadding = useMapPadding();

  const fc = useMemo<FeatureCollection>(() => {
    if (!iso.data?.length) return EMPTY_FC;
    // Les plus grands polygones d'abord pour que les petits restent visibles
    const sorted = [...iso.data].sort((a, b) => b.max_duration - a.max_duration);
    return {
      type: 'FeatureCollection',
      features: sorted.map((i) => {
        const idx = bounds.indexOf(i.max_duration);
        return {
          type: 'Feature',
          properties: { max: i.max_duration, color: RAMP[Math.max(0, PRESETS.indexOf(i.max_duration))] ?? RAMP[idx] ?? '#4fd3ea' },
          geometry: i.geojson,
        };
      }),
    };
  }, [iso.data, bounds]);

  const allPoints = useMemo<LngLat[]>(() => {
    const out: LngLat[] = [];
    const biggest = iso.data?.reduce((a, b) => (b.max_duration > (a?.max_duration ?? 0) ? b : a), iso.data[0]);
    for (const poly of biggest?.geojson.coordinates ?? []) for (const ring of poly) for (const p of ring) out.push([p[0]!, p[1]!]);
    // Échantillonne pour limiter le coût du calcul d'emprise
    return out.filter((_, i) => i % 20 === 0);
  }, [iso.data]);

  const toggle = (b: number) => {
    const next = bounds.includes(b) ? bounds.filter((x) => x !== b) : [...bounds, b].slice(-4);
    set({ b: next.sort((x, y) => x - y).join(',') || undefined });
  };

  return (
    <div className="relative h-full">
      <MapView className="absolute inset-0">
        <GeoJsonLayer
          id="iso"
          data={fc}
          layers={[
            { id: 'iso-fill', type: 'fill', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.16 } },
            { id: 'iso-line', type: 'line', paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': 0.85 } },
          ]}
        />
        <GeoJsonLayer
          id="iso-origin"
          data={origin ? pointsFC([{ id: 'o', lngLat: origin }]) : EMPTY_FC}
          layers={[
            { id: 'iso-origin-halo', type: 'circle', paint: { 'circle-radius': 14, 'circle-color': '#e9edf3', 'circle-opacity': 0.15 } },
            { id: 'iso-origin-dot', type: 'circle', paint: { 'circle-radius': 6, 'circle-color': '#e9edf3', 'circle-stroke-color': '#05080f', 'circle-stroke-width': 2 } },
          ]}
        />
        <FitBounds points={allPoints.length ? allPoints : origin ? [origin] : []} padding={mapPadding} maxZoom={9} />
      </MapView>

      <SidePanel
        header={
          <div className="space-y-4 border-b border-white/[0.06] p-4">
            <div>
              <p className="eyebrow mb-1 text-[10px]">Module 2 · Isochrones</p>
              <h1 className="text-lg font-semibold text-ink-50">Zones atteignables</h1>
              <p className="mt-1 text-xs text-ink-400">Territoire accessible en train depuis une gare, par paliers de durée (API SNCF /isochrones).</p>
            </div>
            <OriginControls />
            <div>
              <span className="label">Paliers (4 max.)</span>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((b, i) => (
                  <FilterChip key={b} active={bounds.includes(b)} color={RAMP[i]} onClick={() => toggle(b)}>
                    {formatDuration(b)}
                  </FilterChip>
                ))}
              </div>
            </div>
          </div>
        }
      >
        <div className="p-4">
          {!from && <EmptyState icon={<Target className="size-5" />} title="Choisissez une gare" description="Les zones atteignables apparaîtront sur la carte, colorées par durée." />}
          {iso.isFetching && (
            <div className="space-y-2">
              <div className="skeleton h-4 w-2/3" />
              <p className="text-xs text-ink-500">Calcul des isochrones… (jusqu’à quelques secondes)</p>
            </div>
          )}
          {iso.isError && <ErrorState error={iso.error} onRetry={() => iso.refetch()} />}
          {iso.data && iso.data.length > 0 && !iso.isFetching && (
            <ul className="space-y-2">
              {[...iso.data]
                .sort((a, b) => a.max_duration - b.max_duration)
                .map((i) => (
                  <li key={i.max_duration} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="size-3 rounded-sm" style={{ background: RAMP[PRESETS.indexOf(i.max_duration)] ?? '#4fd3ea' }} />
                    <span className="text-ink-200">
                      {formatDuration(i.min_duration)} – {formatDuration(i.max_duration)}
                    </span>
                    <span className="ml-auto font-mono text-xs text-ink-500">{i.geojson.coordinates.length} zones</span>
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-ink-500">
            Les zones combinent trajet en train et rabattement à pied autour des gares. Réponses volumineuses : elles sont mises en cache 10 minutes côté serveur.
          </p>
        </div>
      </SidePanel>
    </div>
  );
}
