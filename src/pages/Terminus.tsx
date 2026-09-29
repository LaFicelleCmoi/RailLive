import { useMemo } from 'react';
import { ListOrdered } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StationPicker, useStationParam } from '@/components/StationPicker';
import { ScheduleList } from '@/components/ScheduleList';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useTerminusSchedules } from '@/api/hooks/schedules';
import { cleanName } from '@/components/DeparturesBoard/DeparturesBoard';

export default function TerminusPage() {
  const [stop] = useStationParam();
  const q = useTerminusSchedules(stop, 5);

  // Regroupe par terminus, les plus desservis d'abord
  const items = useMemo(
    () =>
      [...(q.data ?? [])].sort(
        (a, b) =>
          b.date_times.filter((t) => t.date_time).length - a.date_times.filter((t) => t.date_time).length ||
          a.display_informations.direction.localeCompare(b.display_informations.direction, 'fr'),
      ),
    [q.data],
  );

  return (
    <>
      <PageHeader
        eyebrow="Module 3 · Horaires"
        title="Horaires par terminus"
        description="Pour chaque destination finale desservie depuis la gare, les prochains départs toutes lignes confondues."
        endpoint="/stop_areas/{id}/terminus_schedules"
      />
      <StationPicker className="mb-5" />
      {!stop && (
        <div className="panel">
          <EmptyState icon={<ListOrdered className="size-5" />} title="Choisissez une gare" />
        </div>
      )}
      {q.isLoading && <SkeletonRows rows={6} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.isSuccess && items.length === 0 && (
        <div className="panel">
          <EmptyState title="Aucun terminus" description="Aucun départ prévu prochainement." />
        </div>
      )}
      {items.length > 0 && (
        <>
          <p className="mb-3 text-xs text-ink-500">{items.length} terminus desservis</p>
          <ScheduleList items={items} groupLabel={(s) => cleanName(s.display_informations.direction)} />
        </>
      )}
    </>
  );
}
