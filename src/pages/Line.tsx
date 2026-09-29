import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { FeatureCollection } from 'geojson';
import { ArrowRight, Clock, LayoutGrid } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, DefinitionList } from '@/components/ui/Card';
import { ModeBadge } from '@/components/ui/ModeBadge';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, Skeleton, SkeletonRows } from '@/components/ui/States';
import { DisruptionItem } from '@/components/ui/DisruptionItem';
import { MAP_FONT, MapView } from '@/components/map/MapView';
import { FitBounds, GeoJsonLayer, pointsFC } from '@/components/map/layers';
import { useLine, useLineRoutes } from '@/api/hooks/schedules';
import { useLineDisruptions, useLineStopAreas, useLineVehicleJourneys } from '@/api/hooks/catalog';
import { classifyMode, displayColor } from '@/utils/modes';
import { formatHms } from '@/utils/navitiaDate';
import { toLngLat, type LngLat } from '@/utils/geo';
import { cleanName } from '@/components/DeparturesBoard/DeparturesBoard';

export default function LinePage() {
  const { id = '' } = useParams();
  const line = useLine(id);
  const routes = useLineRoutes(id);
  const stopAreas = useLineStopAreas(id);
  const vjs = useLineVehicleJourneys(id);
  const disruptions = useLineDisruptions(id);

  const l = line.data;
  const mode = classifyMode(l?.commercial_mode?.name, l?.network?.name, l?.physical_modes?.[0]?.name);
  const color = displayColor(l?.color, mode);

  // Tracé : l'API SNCF ne fournit pas de géométrie → on relie les arrêts de la circulation la plus longue
  const longest = useMemo(() => [...(vjs.data ?? [])].sort((a, b) => b.stop_times.length - a.stop_times.length)[0], [vjs.data]);
  const path = useMemo<LngLat[]>(() => (longest?.stop_times ?? []).map((st) => toLngLat(st.stop_point.coord)).filter((x): x is LngLat => !!x), [longest]);
  const pathFC = useMemo<FeatureCollection>(
    () => ({ type: 'FeatureCollection', features: path.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path } }] : [] }),
    [path],
  );
  const saPoints = useMemo(
    () =>
      (stopAreas.data ?? [])
        .map((s) => ({ id: s.id, lngLat: toLngLat(s.coord), props: { name: s.name } }))
        .filter((x): x is { id: string; lngLat: LngLat; props: { name: string } } => !!x.lngLat),
    [stopAreas.data],
  );
  const saFC = useMemo(() => pointsFC(saPoints), [saPoints]);

  if (line.isError) return <ErrorState error={line.error} onRetry={() => line.refetch()} />;

  return (
    <>
      <PageHeader
        eyebrow={`Module 7 · Ligne${l?.network ? ` · ${l.network.name}` : ''}`}
        title={
          l ? (
            <span className="flex flex-wrap items-center gap-3">
              <ModeBadge commercialMode={l.commercial_mode?.name} network={l.network?.name} code={l.code || undefined} color={l.color} textColor={l.text_color} className="text-sm" />
              {l.name}
            </span>
          ) : (
            <Skeleton className="h-8 w-80" />
          )
        }
        endpoint={['/lines/{id}', '/lines/{id}/routes', '/lines/{id}/stop_areas', '/lines/{id}/vehicle_journeys', '/lines/{id}/disruptions']}
        actions={
          <Link to={`/route-schedules?line=${encodeURIComponent(id)}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-info-500 px-4 text-sm font-medium text-night-950 hover:bg-info-400">
            <LayoutGrid className="size-4" /> Grille horaire
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <div className="panel h-80 overflow-hidden p-0">
            <MapView className="h-full">
              <GeoJsonLayer
                id="line-path"
                data={pathFC}
                layers={[
                  { id: 'line-path-casing', type: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#05080f', 'line-width': 6 } },
                  { id: 'line-path-line', type: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': 3 } },
                ]}
              />
              <GeoJsonLayer
                id="line-sa"
                data={saFC}
                layers={[
                  { id: 'line-sa-dot', type: 'circle', paint: { 'circle-radius': 4, 'circle-color': '#0e1524', 'circle-stroke-color': color, 'circle-stroke-width': 2 } },
                  {
                    id: 'line-sa-label',
                    type: 'symbol',
                    minzoom: 8,
                    layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-font': MAP_FONT },
                    paint: { 'text-color': '#b8c2d3', 'text-halo-color': '#05080f', 'text-halo-width': 1.3 },
                  },
                ]}
              />
              <FitBounds points={path.length ? path : saPoints.map((p) => p.lngLat)} padding={40} maxZoom={11} />
            </MapView>
          </div>
          <p className="-mt-3 text-[11px] text-ink-500">Tracé reconstruit à partir des arrêts d’une circulation : l’API SNCF ne fournit pas la géométrie des lignes.</p>

          <Card title="Parcours" eyebrow={`${routes.data?.length ?? '…'} parcours`}>
            {routes.isLoading && <SkeletonRows rows={2} />}
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {routes.data?.map((r) => (
                <li key={r.id}>
                  <Link to={`/route-schedules?route=${encodeURIComponent(r.id)}`} className="group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-200 hover:bg-white/[0.04]">
                    <ArrowRight className="size-3.5 text-ink-500" />
                    <span className="truncate">{cleanName(r.direction?.name ?? r.name)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Perturbations en cours" actions={disruptions.data?.length ? <Badge tone="alert">{disruptions.data.length}</Badge> : null}>
            {disruptions.isLoading ? (
              <SkeletonRows rows={2} />
            ) : disruptions.data?.length ? (
              <div className="divide-y divide-white/[0.05]">
                {disruptions.data.slice(0, 15).map((d) => (
                  <DisruptionItem key={d.id} d={d} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-400">Aucune perturbation signalée sur cette ligne.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Identité">
            <DefinitionList
              items={[
                ['Réseau', l?.network ? <Link className="hover:text-info-300" to={`/networks/${encodeURIComponent(l.network.id)}`}>{l.network.name}</Link> : '—'],
                ['Mode commercial', l?.commercial_mode ? <Link className="hover:text-info-300" to={`/catalog/commercial_modes/${encodeURIComponent(l.commercial_mode.id)}`}>{l.commercial_mode.name}</Link> : '—'],
                ['Mode physique', l?.physical_modes?.map((p) => p.name).join(', ') || '—'],
                [
                  'Amplitude',
                  l?.opening_time ? (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Clock className="size-3.5 text-ink-500" /> {formatHms(l.opening_time)} – {formatHms(l.closing_time)}
                    </span>
                  ) : (
                    '—'
                  ),
                ],
                ['Couleur officielle', l?.color ? <span className="font-mono">#{l.color}</span> : 'Non fournie'],
                ['Identifiant', <code className="font-mono text-[11px] break-all">{id}</code>],
              ]}
            />
          </Card>
          <Card title="Gares desservies" eyebrow={`${stopAreas.data?.length ?? '…'} zones d’arrêt`} bodyClassName="p-2">
            {stopAreas.isLoading && <SkeletonRows rows={5} className="p-2" />}
            <ul className="max-h-96 overflow-y-auto">
              {[...(stopAreas.data ?? [])]
                .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
                .map((s) => (
                  <li key={s.id}>
                    <Link to={`/stop-areas/${encodeURIComponent(s.id)}`} className="block truncate rounded-md px-3 py-1.5 text-sm text-ink-200 hover:bg-white/[0.04] hover:text-ink-50">
                      {s.name}
                    </Link>
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
