import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { MAP_FONT, MapView } from '@/components/map/MapView';
import { EMPTY_FC, FitBounds, GeoJsonLayer, pointsFC } from '@/components/map/layers';
import { SidePanel } from '@/components/ui/SidePanel';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { Segmented } from '@/components/ui/Segmented';
import { Stat } from '@/components/ui/Card';
import { OriginControls, useOrigin } from '@/components/OriginControls';
import { useReachable } from '@/api/hooks/journeys';
import { useStopArea } from '@/api/hooks/search';
import { formatDuration } from '@/utils/navitiaDate';
import { toLngLat } from '@/utils/geo';

const DURATIONS = [
  { value: 3600, label: '1 h' },
  { value: 7200, label: '2 h' },
  { value: 10800, label: '3 h' },
  { value: 14400, label: '4 h' },
];

export default function HeatMapPage() {
  const { from, datetime, params, set } = useOrigin();
  const max = Number(params.get('max') ?? 7200);
  const q = useReachable(from, max, datetime);
  const sa = useStopArea(from);
  const origin = toLngLat(sa.data?.coord);
  const points = q.data?.points ?? [];

  const fc = useMemo(
    () =>
      points.length
        ? pointsFC(points.map((p, i) => ({ id: String(i), lngLat: [p.lon, p.lat], props: { name: p.name, d: p.duration, w: 1 - p.duration / max } })))
        : EMPTY_FC,
    [points, max],
  );
  const median = points.length ? points[Math.floor(points.length / 2)]!.duration : 0;
  const direct = points.filter((p) => p.transfers === 0).length;

  const colorExpr = ['interpolate', ['linear'], ['get', 'd'], 0, '#4fd3ea', max * 0.33, '#66a6ff', max * 0.66, '#b18cff', max, '#f7c257'];

  return (
    <div className="relative h-full">
      <MapView className="absolute inset-0">
        <GeoJsonLayer
          id="heat"
          data={fc}
          layers={[
            {
              id: 'heat-layer',
              type: 'heatmap',
              maxzoom: 10,
              paint: {
                'heatmap-weight': ['get', 'w'],
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 9, 2],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 14, 9, 36],
                'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.85, 10, 0.25],
                'heatmap-color': [
                  'interpolate',
                  ['linear'],
                  ['heatmap-density'],
                  0,
                  'rgba(0,0,0,0)',
                  0.15,
                  'rgba(79,211,234,0.25)',
                  0.4,
                  'rgba(102,166,255,0.5)',
                  0.65,
                  'rgba(177,140,255,0.7)',
                  0.9,
                  'rgba(247,194,87,0.85)',
                ],
              },
            },
            {
              id: 'heat-points',
              type: 'circle',
              minzoom: 6,
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 11, 6],
                'circle-color': colorExpr as never,
                'circle-stroke-color': '#05080f',
                'circle-stroke-width': 1,
              },
            },
            {
              id: 'heat-labels',
              type: 'symbol',
              minzoom: 8.5,
              layout: {
                'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['round', ['/', ['get', 'd'], 60]]], ' min'],
                'text-size': 10,
                'text-offset': [0, 1.1],
                'text-anchor': 'top',
                'text-font': MAP_FONT,
              },
              paint: { 'text-color': '#b8c2d3', 'text-halo-color': '#05080f', 'text-halo-width': 1.3 },
            },
          ]}
        />
        <GeoJsonLayer
          id="heat-origin"
          data={origin ? pointsFC([{ id: 'o', lngLat: origin }]) : EMPTY_FC}
          layers={[{ id: 'heat-origin-dot', type: 'circle', paint: { 'circle-radius': 7, 'circle-color': '#e9edf3', 'circle-stroke-color': '#05080f', 'circle-stroke-width': 2 } }]}
        />
        <FitBounds points={points.length ? points.map((p) => [p.lon, p.lat]) : origin ? [origin] : []} padding={{ top: 60, bottom: 60, left: 440, right: 60 }} maxZoom={9} />
      </MapView>

      <SidePanel
        header={
          <div className="space-y-4 border-b border-white/[0.06] p-4">
            <div>
              <p className="eyebrow mb-1 text-[10px]">Module 2 · Heat map</p>
              <h1 className="text-lg font-semibold text-ink-50">Temps de trajet</h1>
              <p className="mt-1 text-xs text-ink-400">
                Carte de chaleur des gares atteignables. L’API SNCF ne fournit pas <code>/heat_maps</code> : RailHub la calcule à partir de <code>/journeys</code> sans destination.
              </p>
            </div>
            <OriginControls />
            <div>
              <span className="label">Durée maximale</span>
              <Segmented value={max} onChange={(v) => set({ max: String(v) })} options={DURATIONS} />
            </div>
          </div>
        }
      >
        <div className="p-4">
          {!from && <EmptyState icon={<Flame className="size-5" />} title="Choisissez une gare" description="La carte de chaleur des temps de trajet s’affichera autour d’elle." />}
          {q.isLoading && <SkeletonRows rows={5} />}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
          {q.data && (
            <>
              <div className="mb-4 grid grid-cols-3 gap-2">
                <Stat size="sm" label="Gares" value={q.data.count} />
                <Stat size="sm" label="Médiane" value={formatDuration(median)} />
                <Stat size="sm" label="Directes" value={direct} tone="info" />
              </div>
              <div className="mb-3 flex items-center gap-2 text-[10px] text-ink-500">
                <span>0</span>
                <span className="h-1.5 flex-1 rounded-full" style={{ background: 'linear-gradient(90deg,#4fd3ea,#66a6ff,#b18cff,#f7c257)' }} />
                <span>{formatDuration(max)}</span>
              </div>
              <p className="eyebrow mb-2 text-[10px]">Gares les plus proches</p>
              <ul className="space-y-0.5">
                {points.slice(0, 40).map((p) => (
                  <li key={p.name} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-white/[0.03]">
                    <span className="min-w-0 flex-1 truncate text-ink-200">{p.name}</span>
                    {p.transfers > 0 && <span className="text-[10px] text-ink-500">{p.transfers} corr.</span>}
                    <span className="font-mono text-xs text-info-300 tabular">{formatDuration(p.duration)}</span>
                  </li>
                ))}
              </ul>
              {from && (
                <Link to={`/isochrones?from=${encodeURIComponent(from)}`} className="mt-4 inline-block text-xs text-info-300 hover:text-info-400">
                  Voir les isochrones de cette gare →
                </Link>
              )}
            </>
          )}
        </div>
      </SidePanel>
    </div>
  );
}
