import { useMemo } from 'react';
import { Accessibility, ArrowUpDown, CircleSlash } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { StationPicker, useStationParam } from '@/components/StationPicker';
import { useEquipmentReports } from '@/api/hooks/disruptions';
import { useStopAreaStopPoints } from '@/api/hooks/search';

export default function EquipmentPage() {
  const reports = useEquipmentReports();
  const [stop] = useStationParam();
  const sps = useStopAreaStopPoints(stop);
  const details = reports.data?.equipment_reports?.flatMap((r) => r.stop_area_equipments ?? []) ?? [];

  const matrix = useMemo(() => {
    const all = new Set<string>();
    for (const sp of sps.data ?? []) for (const e of sp.equipments ?? []) all.add(e);
    return [...all];
  }, [sps.data]);

  return (
    <>
      <PageHeader
        eyebrow="Module 6 · Équipements"
        title="Ascenseurs, escalators & accessibilité"
        description="Disponibilité des équipements en gare et accessibilité déclarée des points d’arrêt."
        endpoint={['/equipment_reports', '/stop_areas/{id}/stop_points']}
      />

      <Card title={<span className="flex items-center gap-2"><ArrowUpDown className="size-4 text-info-400" /> État des ascenseurs et escalators</span>} className="mb-5">
        {reports.isLoading && <SkeletonRows rows={2} />}
        {reports.isError && <ErrorState error={reports.error} />}
        {reports.isSuccess && details.length === 0 && (
          <EmptyState
            className="py-8"
            icon={<CircleSlash className="size-5" />}
            title="Non renseigné"
            description="L’API SNCF ne raccorde actuellement aucun fournisseur d’état des équipements (réponse « No code type exists into equipment provider »). Cette section s’affichera automatiquement si la donnée devient disponible."
          />
        )}
        {details.length > 0 && (
          <ul className="space-y-3">
            {details.map((d) => (
              <li key={d.stop_area.id}>
                <p className="text-sm font-medium text-ink-100">{d.stop_area.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {d.equipment_details.map((e) => (
                    <Badge key={e.id} tone={e.current_availability?.status === 'available' ? 'ok' : e.current_availability?.status === 'unavailable' ? 'alert' : 'neutral'}>
                      {e.embedded_type} {e.name ?? ''} · {e.current_availability?.status ?? 'inconnu'}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={<span className="flex items-center gap-2"><Accessibility className="size-4 text-info-400" /> Accessibilité par point d’arrêt</span>}>
        <StationPicker className="mb-5" />
        {!stop && <p className="text-sm text-ink-500">Choisissez une gare pour afficher les équipements déclarés de chacun de ses points d’arrêt.</p>}
        {sps.isLoading && <SkeletonRows rows={3} />}
        {sps.data && (matrix.length === 0 ? (
          <p className="text-sm text-ink-400">Non renseigné par l’API SNCF pour cette gare.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-500">
                  <th className="pb-2 font-medium">Point d’arrêt</th>
                  {matrix.map((e) => (
                    <th key={e} className="px-2 pb-2 text-center font-medium">
                      {e.replace(/^has_/, '').replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {sps.data.map((sp) => (
                  <tr key={sp.id}>
                    <td className="py-2 pr-3 text-ink-200">
                      {sp.name}
                      <span className="ml-2 text-[11px] text-ink-500">{sp.physical_modes?.[0]?.name}</span>
                    </td>
                    {matrix.map((e) => (
                      <td key={e} className="px-2 text-center">
                        {sp.equipments?.includes(e) ? <span className="text-ok-400">✓ <span className="sr-only">oui</span></span> : <span className="text-ink-600">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Card>
    </>
  );
}
