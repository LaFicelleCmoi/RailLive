import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutGrid } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlaceAutocomplete } from '@/components/SearchBox/PlaceAutocomplete';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { Segmented } from '@/components/ui/Segmented';
import { ModeBadge } from '@/components/ui/ModeBadge';
import { useLine, useLineRoutes, useRoute, useRouteSchedules } from '@/api/hooks/schedules';
import { delayMinutes, fromDateTimeLocal, navitiaTime, toDateTimeLocal, toNavitiaDate } from '@/utils/navitiaDate';
import { cleanName } from '@/components/DeparturesBoard/DeparturesBoard';

const DURATIONS = [
  { value: 3600, label: '1 h' },
  { value: 7200, label: '2 h' },
  { value: 14400, label: '4 h' },
];

export default function RouteSchedulesPage() {
  const [params, setParams] = useSearchParams();
  const routeId = params.get('route') ?? undefined;
  const route = useRoute(routeId);
  const lineId = params.get('line') ?? route.data?.line?.id;
  const line = useLine(lineId);
  const routes = useLineRoutes(lineId);
  const duration = Number(params.get('duration') ?? 3600);
  const fromLocal = params.get('from') ?? toDateTimeLocal(new Date());
  const fromDate = fromDateTimeLocal(fromLocal) ?? new Date();
  const grid = useRouteSchedules(routeId, toNavitiaDate(fromDate).slice(0, 13) + '00', duration);

  const update = (patch: Record<string, string | undefined>) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    setParams(n);
  };

  // Sélectionne automatiquement le premier parcours d'une ligne
  useEffect(() => {
    if (!routeId && routes.data?.[0]) update({ route: routes.data[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, routes.data]);

  const table = grid.data?.table;
  const headers = table?.headers ?? [];
  const rows = useMemo(() => (table?.rows ?? []).filter((r) => r.date_times.some((d) => d.date_time)), [table]);
  const di = grid.data?.display_informations;

  return (
    <>
      <PageHeader
        eyebrow="Module 3 · Horaires"
        title="Grille horaire de ligne"
        description="Tableau arrêts × circulations d’un parcours, sur une fenêtre de 1 à 4 heures (fenêtre bornée par le proxy pour préserver le quota)."
        endpoint={['/lines/{id}/routes', '/routes/{id}/route_schedules']}
      />

      <div className="panel mb-5 grid gap-4 p-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
        <PlaceAutocomplete
          label="Ligne"
          placeholder="TER, RER A, Paris - Lyon…"
          placeTypes={[]}
          ptTypes={['line']}
          value={lineId ? { id: lineId, name: line.data?.name ?? 'Chargement…', type: 'line' } : null}
          onChange={(p) => update({ line: p?.id, route: undefined })}
        />
        <div>
          <label className="label" htmlFor="route-select">
            Parcours / direction
          </label>
          <select id="route-select" className="input" value={routeId ?? ''} onChange={(e) => update({ route: e.target.value || undefined })} disabled={!routes.data?.length}>
            {!routes.data?.length && <option value="">—</option>}
            {routes.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} → {cleanName(r.direction?.name ?? '')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">
            À partir de
          </label>
          <input id="from" type="datetime-local" className="input" value={fromLocal} onChange={(e) => update({ from: e.target.value })} />
        </div>
        <div>
          <span className="label">Fenêtre</span>
          <Segmented value={duration} onChange={(v) => update({ duration: String(v) })} options={DURATIONS} />
        </div>
      </div>

      {!routeId && !lineId && (
        <div className="panel">
          <EmptyState icon={<LayoutGrid className="size-5" />} title="Choisissez une ligne" description="Recherchez une ligne (RER, TER, TGV…) pour afficher sa grille horaire." />
        </div>
      )}
      {grid.isLoading && <SkeletonRows rows={8} />}
      {grid.isError && <ErrorState error={grid.error} onRetry={() => grid.refetch()} />}
      {grid.data && headers.length === 0 && (
        <div className="panel">
          <EmptyState title="Aucune circulation" description="Aucun train sur cette fenêtre. Essayez une autre heure ou une fenêtre plus large." />
        </div>
      )}

      {di && headers.length > 0 && (
        <div className="panel overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-3">
            <ModeBadge commercialMode={di.commercial_mode} network={di.network} physicalMode={di.physical_mode} code={di.code || undefined} color={di.color} textColor={di.text_color} />
            <span className="text-sm font-medium text-ink-100">{di.name}</span>
            <span className="text-sm text-ink-500">→ {cleanName(di.direction)}</span>
            <span className="ml-auto font-mono text-xs text-ink-500">
              {rows.length} arrêts × {headers.length} circulations
            </span>
          </div>
          <div className={clsx('max-h-[70vh] overflow-auto', grid.isFetching && 'opacity-60 transition-opacity')}>
            <table className="border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 min-w-56 border-r border-b border-white/[0.06] bg-night-800 px-4 py-2.5 text-left">
                    <span className="eyebrow text-[10px]">Gare</span>
                  </th>
                  {headers.map((h, i) => {
                    const vj = h.links?.find((l) => l.type === 'vehicle_journey')?.id;
                    const num = h.display_informations.trip_short_name || h.display_informations.headsign;
                    return (
                      <th key={i} className="sticky top-0 z-20 border-b border-white/[0.06] bg-night-800 px-2 py-2.5 text-center">
                        {vj ? (
                          <Link to={`/train/${encodeURIComponent(vj)}`} className="font-mono text-xs text-info-300 hover:text-info-400">
                            {num}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-ink-400">{num}</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={`${r.stop_point.id}-${ri}`} className="group">
                    <th className="sticky left-0 z-10 max-w-64 truncate border-r border-b border-white/[0.04] bg-night-800 px-4 py-1.5 text-left font-normal text-ink-200 group-hover:bg-night-700">
                      <Link to={`/stop-areas/${encodeURIComponent(r.stop_point.stop_area?.id ?? '')}`} className="hover:text-info-300">
                        {r.stop_point.name}
                      </Link>
                    </th>
                    {r.date_times.map((d, ci) => {
                      const delay = delayMinutes(d.base_date_time, d.date_time);
                      return (
                        <td
                          key={ci}
                          className={clsx(
                            'border-b border-white/[0.04] px-2 py-1.5 text-center font-mono text-xs tabular group-hover:bg-white/[0.02]',
                            !d.date_time ? 'text-ink-600' : delay > 0 ? 'text-alert-300' : 'text-ink-100',
                          )}
                          title={delay > 0 ? `Retard ${delay} min` : undefined}
                        >
                          {d.date_time ? navitiaTime(d.date_time) : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
