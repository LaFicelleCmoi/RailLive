import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, DefinitionList, Stat } from '@/components/ui/Card';
import { ModeBadge } from '@/components/ui/ModeBadge';
import { Pagination } from '@/components/ui/Pagination';
import { ErrorState, Skeleton, SkeletonRows } from '@/components/ui/States';
import { useObject, useObjectLines, useRelatedCount } from '@/api/hooks/catalog';
import { seg } from '@/api/params';

const LABELS: Record<string, string> = {
  networks: 'Réseau',
  commercial_modes: 'Mode commercial',
  physical_modes: 'Mode physique',
  companies: 'Compagnie',
};

/** Page générique d'un objet du référentiel : identité + objets liés (lignes, gares, parcours). */
export default function ObjectDetailPage({ forcedType }: { forcedType?: string }) {
  const params = useParams();
  const type = forcedType ?? params.type ?? 'networks';
  const id = params.id ?? '';
  const obj = useObject(type, id);
  const scope = `${type}/${seg(id)}`;
  const [page, setPage] = useState(0);
  const lines = useObjectLines(scope, page);
  const stopAreas = useRelatedCount(scope, 'stop_areas');
  const routes = useRelatedCount(scope, 'routes');
  const lineCount = lines.data?.pagination?.total_result;

  if (obj.isError) return <ErrorState error={obj.error} onRetry={() => obj.refetch()} />;
  const o = obj.data as Record<string, unknown> | null | undefined;
  const codes = (o?.codes as { type: string; value: string }[] | undefined) ?? [];

  return (
    <>
      <PageHeader
        eyebrow={`Module 7 · ${LABELS[type] ?? type}`}
        title={o ? String(o.name ?? id) : <Skeleton className="h-8 w-64" />}
        endpoint={[`/${type}/{id}`, `/${type}/{id}/lines`, `/${type}/{id}/stop_areas`]}
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Lignes" value={lineCount?.toLocaleString('fr-FR') ?? '…'} tone="info" />
        <Stat label="Zones d’arrêt" value={stopAreas.data?.toLocaleString('fr-FR') ?? '…'} />
        <Stat label="Parcours" value={routes.data?.toLocaleString('fr-FR') ?? '…'} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card title="Lignes" eyebrow={`/${type}/{id}/lines`} bodyClassName="p-2">
          {lines.isLoading && <SkeletonRows rows={8} className="p-2" />}
          <ul>
            {(lines.data?.lines ?? []).map((l) => (
              <li key={l.id}>
                <Link to={`/lines/${encodeURIComponent(l.id)}`} className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.04]">
                  <ModeBadge commercialMode={l.commercial_mode?.name} network={l.network?.name} code={l.code || undefined} color={l.color} textColor={l.text_color} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-100">{l.name}</span>
                  <ArrowRight className="size-4 text-ink-600 group-hover:text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
          {lines.data?.pagination && (
            <div className="px-3 pb-2">
              <Pagination page={page} total={lines.data.pagination.total_result} perPage={25} onChange={setPage} />
            </div>
          )}
        </Card>
        <Card title="Identité">
          <DefinitionList
            items={[
              ['Identifiant', <code className="font-mono text-[11px] break-all">{id}</code>],
              ...codes.slice(0, 6).map((c) => [c.type, <span className="font-mono text-xs">{c.value}</span>] as [string, React.ReactNode]),
              ...(type === 'physical_modes' && o?.co2_emission_rate
                ? [['Émissions CO₂', `${(o.co2_emission_rate as { value: number }).value} ${(o.co2_emission_rate as { unit: string }).unit}`] as [string, React.ReactNode]]
                : []),
            ]}
          />
        </Card>
      </div>
    </>
  );
}
