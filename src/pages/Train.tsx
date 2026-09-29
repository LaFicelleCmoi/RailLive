import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Clock, MapPinned, TrainFront } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, DefinitionList } from '@/components/ui/Card';
import { Badge, LiveDot } from '@/components/ui/Badge';
import { ModeBadge } from '@/components/ui/ModeBadge';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { ErrorState, Skeleton, SkeletonRows } from '@/components/ui/States';
import { DisruptionItem } from '@/components/ui/DisruptionItem';
import { Timeline, type TimelineItem } from '@/components/Timeline/Timeline';
import { CalendarGrid } from '@/components/CalendarGrid/CalendarGrid';
import { MapView } from '@/components/map/MapView';
import { FitBounds, GeoJsonLayer, pointsFC } from '@/components/map/layers';
import { useRailPath, useTrainsByNumber, useVehicleJourney, useVehicleJourneyLine } from '@/api/hooks/trains';
import { useRegion } from '@/api/hooks/meta';
import { buildTimeline, trainStatus } from '@/utils/vehicleJourney';
import { interpolatePosition, preparePath } from '@/utils/interpolate';
import { classifyMode, MODE_META } from '@/utils/modes';
import { formatDuration, formatTime } from '@/utils/navitiaDate';
import { useNow } from '@/utils/hooks';
import type { LngLat } from '@/utils/geo';

const STATUS_META = {
  not_started: { label: 'Pas encore parti', tone: 'neutral' as const },
  running: { label: 'En circulation', tone: 'info' as const },
  arrived: { label: 'Arrivé', tone: 'ok' as const },
  cancelled: { label: 'Supprimé', tone: 'alert' as const },
};

export default function TrainPage() {
  const { id = '' } = useParams();
  const vjQ = useVehicleJourney(id);
  const line = useVehicleJourneyLine(id);
  const region = useRegion();
  const now = useNow(1000);
  const vj = vjQ.data?.vehicle_journeys?.[0];
  const number = vj?.trip?.name ?? vj?.headsign ?? vj?.name;
  const siblings = useTrainsByNumber(number);

  const tl = useMemo(() => (vj ? buildTimeline(vj, vjQ.data?.disruptions ?? []) : null), [vj, vjQ.data?.disruptions]);
  const mode = classifyMode(line.data?.commercial_mode?.name, line.data?.network?.name, id.split(':').pop());
  const color = MODE_META[mode].color;
  const status = tl ? trainStatus(tl, now) : null;
  const stops = useMemo(() => tl?.stops ?? [], [tl]);
  const valid = useMemo(() => stops.filter((s) => !s.deleted), [stops]);
  const first = valid[0];
  const last = valid[valid.length - 1];
  const maxDelay = Math.max(0, ...stops.map((s) => s.delay));

  const items: TimelineItem[] = stops.map((s, i) => ({
    key: `${s.id}-${i}`,
    name: s.name,
    href: s.stopAreaId ? `/stop-areas/${encodeURIComponent(s.stopAreaId)}` : undefined,
    baseArr: s.baseArr,
    baseDep: s.baseDep,
    arr: s.arr,
    dep: s.dep,
    delay: s.delay,
    deleted: s.deleted,
    added: s.added,
    cause: s.cause,
  }));

  // Carte : tracé sur les rails et position estimée
  const located = useMemo(() => valid.filter((s) => s.lon !== undefined), [valid]);
  const path = useMemo<LngLat[]>(() => located.map((s) => [s.lon!, s.lat!]), [located]);
  const rail = useRailPath(path.length > 1 ? path : null);
  const railLine = useMemo<LngLat[]>(() => (rail.data ? rail.data.flatMap((seg, i) => (i === 0 ? seg : seg.slice(1))) : path), [rail.data, path]);
  const pathFC = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: railLine.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: railLine } }] : [],
    }),
    [railLine],
  );
  const stopsFC = useMemo(() => pointsFC(located.map((s, i) => ({ id: `${s.id}-${i}`, lngLat: [s.lon!, s.lat!] as LngLat, props: { name: s.name } }))), [located]);
  const timed = useMemo(
    () =>
      located.map((s, i) => ({
        lon: s.lon!,
        lat: s.lat!,
        a: s.arr.getTime() / 1000,
        d: s.dep.getTime() / 1000,
        path: rail.data?.[i] ? preparePath(rail.data[i]!) : undefined,
      })),
    [located, rail.data],
  );
  const pos = status === 'running' ? interpolatePosition(timed, now.getTime() / 1000) : null;
  const posFC = useMemo(() => pointsFC(pos ? [{ id: 'train', lngLat: [pos.lon, pos.lat] }] : []), [pos?.lon, pos?.lat]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jours de circulation : une circulation par jour porte le même numéro
  const activeDays = useMemo(() => {
    const set = new Set<string>();
    for (const s of siblings.data ?? []) {
      const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s.id);
      if (m) set.add(`${m[1]}${m[2]}${m[3]}`);
    }
    return set;
  }, [siblings.data]);
  const serviceYmd = tl?.serviceDate.replace(/-/g, '');

  if (vjQ.isError) return <ErrorState error={vjQ.error} onRetry={() => vjQ.refetch()} />;

  return (
    <>
      <PageHeader
        eyebrow={`Module 4 · Train${tl ? ` · ${new Date(`${tl.serviceDate}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })}` : ''}`}
        title={
          vj ? (
            <span className="flex flex-wrap items-center gap-3">
              <ModeBadge mode={mode} commercialMode={line.data?.commercial_mode?.name} code={number} className="text-sm" />
              <span>
                {first?.name} <span className="text-ink-500">→</span> {last?.name}
              </span>
            </span>
          ) : (
            <Skeleton className="h-8 w-96" />
          )
        }
        endpoint={['/vehicle_journeys/{id}', '/vehicle_journeys/{id}/lines', '/vehicle_journeys?headsign=']}
        actions={
          vj && (
            <>
              {status && (
                <Badge tone={STATUS_META[status].tone} className="h-8 px-3 text-xs">
                  {status === 'running' && <LiveDot />}
                  {STATUS_META[status].label}
                </Badge>
              )}
              {maxDelay > 0 && status !== 'cancelled' && (
                <Badge tone="alert" className="h-8 px-3 text-xs">
                  Retard jusqu’à +{maxDelay} min
                </Badge>
              )}
              <FavoriteButton fav={{ kind: 'train', id, name: `${MODE_META[mode].short} ${number}`, direction: last?.name }} />
            </>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card
          title="Marche du train"
          eyebrow={first && last ? `${valid.length} arrêts · ${formatDuration((last.arr.getTime() - first.dep.getTime()) / 1000)}` : undefined}
          actions={
            <span className="flex items-center gap-1.5 font-mono text-xs text-ink-400">
              <Clock className="size-3.5" /> {formatTime(now)}
            </span>
          }
        >
          {vjQ.isLoading ? <SkeletonRows rows={8} /> : <Timeline items={items} now={now} color={color} />}
        </Card>

        <div className="space-y-5">
          <div className="panel h-72 overflow-hidden p-0">
            <MapView className="h-full" bare>
              <GeoJsonLayer
                id="train-path"
                data={pathFC}
                layers={[
                  { id: 'train-path-casing', type: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#05080f', 'line-width': 6 } },
                  { id: 'train-path-line', type: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': 3, 'line-opacity': 0.9 } },
                ]}
              />
              <GeoJsonLayer
                id="train-stops"
                data={stopsFC}
                layers={[{ id: 'train-stops-dot', type: 'circle', paint: { 'circle-radius': 3.5, 'circle-color': '#0e1524', 'circle-stroke-color': color, 'circle-stroke-width': 1.5 } }]}
              />
              <GeoJsonLayer
                id="train-pos"
                data={posFC}
                layers={[
                  { id: 'train-pos-halo', type: 'circle', paint: { 'circle-radius': 14, 'circle-color': color, 'circle-opacity': 0.2, 'circle-blur': 0.4 } },
                  { id: 'train-pos-dot', type: 'circle', paint: { 'circle-radius': 6, 'circle-color': color, 'circle-stroke-color': '#05080f', 'circle-stroke-width': 2 } },
                ]}
              />
              <FitBounds points={railLine} padding={30} maxZoom={11} />
            </MapView>
          </div>
          <p className="-mt-3 flex items-center gap-1.5 text-[11px] text-ink-500">
            <MapPinned className="size-3.5" /> Position estimée le long des voies d’après les horaires (pas de GPS).
            <Link to={`/live`} className="ml-auto text-info-300 hover:text-info-400">
              Carte live →
            </Link>
          </p>

          {tl && tl.disruptions.length > 0 && (
            <Card title={<span className="flex items-center gap-2"><AlertTriangle className="size-4 text-wait-400" /> Perturbations</span>}>
              <div className="divide-y divide-white/[0.05]">
                {tl.disruptions.map((d) => (
                  <DisruptionItem key={d.id} d={d} compact />
                ))}
              </div>
            </Card>
          )}

          <Card title={<span className="flex items-center gap-2"><CalendarDays className="size-4 text-info-400" /> Jours de circulation</span>} eyebrow={`${activeDays.size} jour(s) sur la période`}>
            {siblings.isLoading || region.isLoading ? (
              <SkeletonRows rows={3} />
            ) : region.data ? (
              <CalendarGrid activeDays={activeDays} range={[region.data.start_production_date, region.data.end_production_date]} highlight={serviceYmd} />
            ) : null}
            <p className="mt-3 text-[11px] text-ink-500">Période couverte par les données de production de l’API SNCF. Le jour affiché est entouré.</p>
          </Card>

          <Card title={<span className="flex items-center gap-2"><TrainFront className="size-4 text-ink-400" /> Identité</span>}>
            <DefinitionList
              items={[
                ['Numéro', <span className="font-mono">{number ?? '—'}</span>],
                ['Mode', line.data?.commercial_mode?.name ?? MODE_META[mode].label],
                ['Réseau', line.data?.network?.name ?? '—'],
                ['Ligne', line.data ? <Link className="hover:text-info-300" to={`/lines/${encodeURIComponent(line.data.id)}`}>{line.data.name}</Link> : '—'],
                ['Circulation', <code className="font-mono text-[11px] break-all">{id}</code>],
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
