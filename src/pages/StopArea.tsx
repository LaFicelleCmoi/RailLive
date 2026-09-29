import { useMemo, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Accessibility, ArrowDownToLine, ArrowUpFromLine, CalendarClock, ListOrdered, MapPinned, Navigation, TrainFront } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, DefinitionList } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton, SkeletonRows } from '@/components/ui/States';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { ModeBadge } from '@/components/ui/ModeBadge';
import { Badge } from '@/components/ui/Badge';
import { DisruptionItem } from '@/components/ui/DisruptionItem';
import { MapView } from '@/components/map/MapView';
import { GeoJsonLayer, pointsFC } from '@/components/map/layers';
import { useStopArea, useStopAreaDisruptions, useStopAreaLines, useStopAreaStopPoints } from '@/api/hooks/search';
import { classifyMode, MODE_META, type TrainMode } from '@/utils/modes';
import { toLngLat } from '@/utils/geo';
import type { Line } from '@/types/navitia';

const EQUIPMENT_LABEL: Record<string, string> = {
  has_wheelchair_accessibility: 'Accessible fauteuil roulant',
  has_wheelchair_boarding: 'Embarquement fauteuil',
  has_bike_accepted: 'Vélos acceptés',
  has_elevator: 'Ascenseur',
  has_escalator: 'Escalator',
  has_sheltered: 'Abri',
  has_visual_announcement: 'Annonces visuelles',
  has_audible_announcement: 'Annonces sonores',
  has_appropriate_signage: 'Signalétique adaptée',
  has_bike_depot: 'Consigne vélo',
  has_air_conditioned: 'Climatisation',
};

export default function StopAreaPage() {
  const { id = '' } = useParams();
  const sa = useStopArea(id);
  const lines = useStopAreaLines(id);
  const stopPoints = useStopAreaStopPoints(id);
  const disruptions = useStopAreaDisruptions(id);

  const ll = toLngLat(sa.data?.coord);
  const uic = sa.data?.codes?.filter((c) => c.type === 'uic').map((c) => c.value) ?? [];
  const otherCodes = sa.data?.codes?.filter((c) => c.type !== 'uic') ?? [];
  const city = sa.data?.administrative_regions?.[0];

  const grouped = useMemo(() => {
    const g = new Map<TrainMode, Line[]>();
    for (const l of lines.data ?? []) {
      const m = classifyMode(l.commercial_mode?.name, l.network?.name, l.physical_modes?.[0]?.name);
      g.set(m, [...(g.get(m) ?? []), l]);
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [lines.data]);

  const equipments = useMemo(() => {
    const set = new Set<string>();
    for (const sp of stopPoints.data ?? []) for (const e of sp.equipments ?? []) set.add(e);
    return [...set];
  }, [stopPoints.data]);

  const enc = encodeURIComponent(id);

  if (sa.isError) return <ErrorState error={sa.error} onRetry={() => sa.refetch()} />;

  return (
    <>
      <PageHeader
        eyebrow={city ? `Gare · ${city.name}${city.zip_code ? ` (${city.zip_code.split(';')[0]})` : ''}` : 'Fiche gare'}
        title={sa.data?.name ?? <Skeleton className="h-8 w-72" />}
        endpoint={['/stop_areas/{id}', '/stop_areas/{id}/lines', '/stop_areas/{id}/disruptions']}
        actions={
          sa.data && (
            <>
              <FavoriteButton fav={{ kind: 'station', id, name: sa.data.name }} />
              <Link to={`/board?stop=${enc}`}>
                <Button variant="primary" icon={<ArrowUpFromLine className="size-4" />}>
                  Départs
                </Button>
              </Link>
            </>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { to: `/board?stop=${enc}&type=arrivals`, icon: ArrowDownToLine, label: 'Arrivées' },
              { to: `/schedules?stop=${enc}`, icon: CalendarClock, label: 'Horaires' },
              { to: `/terminus?stop=${enc}`, icon: ListOrdered, label: 'Par terminus' },
              { to: `/journeys?from=${enc}&fromName=${encodeURIComponent(sa.data?.name ?? '')}`, icon: Navigation, label: 'Itinéraire' },
            ].map((a) => (
              <Link key={a.label} to={a.to} className="panel group flex items-center gap-3 p-3.5 transition-colors hover:border-white/15">
                <a.icon className="size-4 text-info-400" />
                <span className="text-sm font-medium text-ink-200 group-hover:text-ink-50">{a.label}</span>
              </Link>
            ))}
          </div>

          <Card title="Lignes desservies" eyebrow={`${lines.data?.length ?? '…'} lignes`} delay={0.05}>
            {lines.isLoading && <SkeletonRows rows={3} />}
            {lines.isError && <ErrorState error={lines.error} />}
            <div className="space-y-5">
              {grouped.map(([mode, ls]) => (
                <div key={mode}>
                  <p className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-400">
                    <span className="size-2 rounded-full" style={{ background: MODE_META[mode].color }} />
                    {MODE_META[mode].label} · {ls.length}
                  </p>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {ls.map((l) => (
                      <li key={l.id}>
                        <Link
                          to={`/lines/${encodeURIComponent(l.id)}`}
                          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink-300 transition-colors hover:bg-white/[0.04] hover:text-ink-50"
                        >
                          <ModeBadge
                            commercialMode={l.commercial_mode?.name}
                            network={l.network?.name}
                            code={l.code || undefined}
                            color={l.color}
                            textColor={l.text_color}
                            mode={mode}
                          />
                          <span className="truncate">{l.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Perturbations en cours"
            delay={0.1}
            actions={disruptions.data?.length ? <Badge tone="alert">{disruptions.data.length}</Badge> : null}
          >
            {disruptions.isLoading ? (
              <SkeletonRows rows={2} />
            ) : disruptions.data?.length ? (
              <div className="divide-y divide-white/[0.05]">
                {disruptions.data.slice(0, 10).map((d) => (
                  <DisruptionItem key={d.id} d={d} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-400">Aucune perturbation signalée pour cette gare.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <div className="panel h-64 overflow-hidden p-0">
            {ll ? (
              <MapView className="h-full" center={ll} zoom={14} bare>
                <GeoJsonLayer
                  id="sa"
                  data={pointsFC([{ id, lngLat: ll }])}
                  layers={[
                    { id: 'sa-halo', type: 'circle', paint: { 'circle-radius': 18, 'circle-color': '#4fd3ea', 'circle-opacity': 0.15 } },
                    { id: 'sa-dot', type: 'circle', paint: { 'circle-radius': 6, 'circle-color': '#4fd3ea', 'circle-stroke-color': '#05080f', 'circle-stroke-width': 2 } },
                  ]}
                />
              </MapView>
            ) : (
              <Skeleton className="h-full rounded-none" />
            )}
          </div>

          <Card title="Identité" delay={0.05}>
            {sa.isLoading ? (
              <SkeletonRows rows={4} />
            ) : (
              <DefinitionList
                items={[
                  ['Identifiant', <code className="font-mono text-xs">{id}</code>],
                  ['Code(s) UIC', uic.length ? <span className="font-mono">{uic.join(' · ')}</span> : '—'],
                  ['Commune', city ? `${city.name}${city.insee ? ` · INSEE ${city.insee}` : ''}` : '—'],
                  ['Coordonnées', ll ? <span className="font-mono text-xs">{ll[1].toFixed(5)}, {ll[0].toFixed(5)}</span> : '—'],
                  ['Fuseau', sa.data?.timezone ?? '—'],
                  ['Points d’arrêt', stopPoints.data?.length ?? '…'],
                  ...otherCodes.slice(0, 4).map((c) => [c.type, <span className="font-mono text-xs">{c.value}</span>] as [string, ReactNode]),
                ]}
              />
            )}
            {ll && (
              <Link to={`/search?lon=${ll[0]}&lat=${ll[1]}&label=${encodeURIComponent(sa.data?.name ?? '')}`} className="mt-3 inline-flex items-center gap-1.5 text-xs text-info-300 hover:text-info-400">
                <MapPinned className="size-3.5" /> Gares à proximité
              </Link>
            )}
          </Card>

          <Card title="Accessibilité & équipements" delay={0.1}>
            {stopPoints.isLoading ? (
              <SkeletonRows rows={2} />
            ) : equipments.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {equipments.map((e) => (
                  <li key={e}>
                    <Badge tone="info">
                      <Accessibility className="size-3" />
                      {EQUIPMENT_LABEL[e] ?? e.replace(/^has_/, '').replace(/_/g, ' ')}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-400">Non renseigné par l’API SNCF pour cette gare.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {sa.data?.physical_modes?.map((m) => (
                <Badge key={m.id}>
                  <TrainFront className="size-3" />
                  {m.name}
                </Badge>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
