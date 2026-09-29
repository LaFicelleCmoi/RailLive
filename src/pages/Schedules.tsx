import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StationPicker, useStationParam } from '@/components/StationPicker';
import { ScheduleList } from '@/components/ScheduleList';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useStopSchedules } from '@/api/hooks/schedules';
import { useStopAreaLines } from '@/api/hooks/search';

export default function SchedulesPage() {
  const [params, setParams] = useSearchParams();
  const [stop] = useStationParam();
  const line = params.get('line') ?? undefined;
  const lines = useStopAreaLines(stop);
  const schedules = useStopSchedules(stop, line, 6);

  const sortedLines = useMemo(() => [...(lines.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [lines.data]);

  return (
    <>
      <PageHeader
        eyebrow="Module 3 · Horaires"
        title="Horaires en gare"
        description="Prochains passages en gare, par ligne et par direction. Sélectionnez une ligne pour ne garder que sa fiche horaire."
        endpoint={['/stop_areas/{id}/stop_schedules', '/stop_areas/{id}/lines/{id}/stop_schedules']}
      />
      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <StationPicker />
        {stop && (
          <div>
            <label className="label" htmlFor="line-select">
              Ligne
            </label>
            <select
              id="line-select"
              className="input"
              value={line ?? ''}
              onChange={(e) => {
                const n = new URLSearchParams(params);
                if (e.target.value) n.set('line', e.target.value);
                else n.delete('line');
                setParams(n);
              }}
            >
              <option value="">Toutes les lignes ({lines.data?.length ?? '…'})</option>
              {sortedLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.commercial_mode?.name ? `${l.commercial_mode.name} · ` : ''}
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!stop && (
        <div className="panel">
          <EmptyState icon={<CalendarClock className="size-5" />} title="Choisissez une gare" description="Les fiches horaires s’afficheront par ligne et par direction." />
        </div>
      )}
      {schedules.isLoading && <SkeletonRows rows={6} />}
      {schedules.isError && <ErrorState error={schedules.error} onRetry={() => schedules.refetch()} />}
      {schedules.data && schedules.data.schedules.length === 0 && (
        <div className="panel">
          <EmptyState title="Aucun horaire" description="Aucun passage prévu pour cette sélection." />
        </div>
      )}
      {schedules.data && <ScheduleList items={schedules.data.schedules} />}
    </>
  );
}
