import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { ChevronDown, CircleSlash, Info, Table2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, Stat } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, SkeletonRows } from '@/components/ui/States';
import { NetworkImpactChart } from '@/components/charts/NetworkImpactChart';
import { StatusBar } from '@/components/charts/StatusBar';
import { EFFECT_META, effectMeta } from '@/components/ui/DisruptionItem';
import { useLineReports, useTrafficReports } from '@/api/hooks/disruptions';
import type { Disruption, DisruptionEffect } from '@/types/navitia';

const TONE_COLOR = { alert: '#f8716c', wait: '#f7c257', info: '#4fd3ea', neutral: '#8d99ae', ok: '#4cd6a0' } as const;

export default function TrafficPage() {
  const q = useTrafficReports();
  const lineReports = useLineReports();
  const [open, setOpen] = useState<string | null>(null);
  const [table, setTable] = useState(false);

  const disById = useMemo(() => new Map((q.data?.disruptions ?? []).map((d) => [d.id, d])), [q.data]);
  const reports = useMemo(
    () =>
      (q.data?.traffic_reports ?? [])
        .map((r) => ({
          network: r.network.name,
          id: r.network.id,
          trains: r.vehicle_journeys ?? [],
          lines: r.lines ?? [],
          stopAreas: r.stop_areas ?? [],
        }))
        .sort((a, b) => b.trains.length + b.lines.length - (a.trains.length + a.lines.length)),
    [q.data],
  );

  const effectCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const d of q.data?.disruptions ?? []) c.set(d.severity?.effect ?? 'UNKNOWN_EFFECT', (c.get(d.severity?.effect ?? 'UNKNOWN_EFFECT') ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [q.data]);

  const totalTrains = reports.reduce((s, r) => s + r.trains.length, 0);
  const chartData = reports.filter((r) => r.trains.length > 0).map((r) => ({ network: r.network, trains: r.trains.length }));

  const firstDisruption = (links?: { id?: string; type: string }[]): Disruption | undefined =>
    links?.filter((l) => l.type === 'disruption' && l.id).map((l) => disById.get(l.id!)).find(Boolean);

  return (
    <>
      <PageHeader
        eyebrow="Module 6 · Temps réel"
        title="État du trafic"
        description="Synthèse des perturbations actives par réseau (TGV INOUI, OUIGO, Intercités, TER régionaux…)."
        endpoint={['/traffic_reports', '/line_reports']}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Réseaux touchés" value={q.data ? reports.length : '…'} />
        <Stat label="Circulations impactées" value={q.data ? totalTrains : '…'} tone={totalTrains ? 'wait' : undefined} />
        <Stat label="Perturbations actives" value={q.data?.disruptions?.length ?? '…'} tone="info" />
        <Stat label="Suppressions" value={q.data?.disruptions?.filter((d) => d.severity?.effect === 'NO_SERVICE').length ?? '…'} tone="alert" />
      </div>

      {q.isLoading && <SkeletonRows rows={6} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}

      {q.data && (
        <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
          <Card
            title="Circulations impactées par réseau"
            actions={
              <button onClick={() => setTable((t) => !t)} className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-100" aria-pressed={table}>
                <Table2 className="size-3.5" /> {table ? 'Graphique' : 'Tableau'}
              </button>
            }
          >
            {chartData.length === 0 ? (
              <p className="text-sm text-ink-400">Aucune circulation impactée actuellement.</p>
            ) : table ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-500">
                    <th className="pb-2 font-medium">Réseau</th>
                    <th className="pb-2 text-right font-medium">Circulations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {chartData.map((d) => (
                    <tr key={d.network}>
                      <td className="py-1.5 text-ink-200">{d.network}</td>
                      <td className="py-1.5 text-right font-mono text-ink-100">{d.trains}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <NetworkImpactChart data={chartData} />
            )}
          </Card>

          <div className="space-y-5">
            <Card title="Répartition par effet">
              <StatusBar
                segments={effectCounts.map(([e, v]) => ({
                  key: e,
                  label: EFFECT_META[e as DisruptionEffect]?.label ?? e,
                  value: v,
                  color: TONE_COLOR[EFFECT_META[e as DisruptionEffect]?.tone ?? 'neutral'],
                }))}
              />
            </Card>
            <Card title="État des lignes" eyebrow="/line_reports">
              {lineReports.isLoading ? (
                <SkeletonRows rows={2} />
              ) : lineReports.data?.line_reports?.length ? (
                <ul className="space-y-1.5 text-sm">
                  {lineReports.data.line_reports.map((l) => (
                    <li key={l.line.id}>
                      <Link to={`/lines/${encodeURIComponent(l.line.id)}`} className="text-ink-200 hover:text-info-300">
                        {l.line.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-start gap-2 text-sm text-ink-400">
                  <CircleSlash className="mt-0.5 size-4 shrink-0 text-ink-500" />
                  Non renseigné : l’API SNCF ne publie pas d’état par ligne. Les perturbations sont suivies par circulation (voir ci-dessous).
                </p>
              )}
            </Card>
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <Card title="Détail par réseau" className="mt-5" bodyClassName="p-2">
          <ul className="divide-y divide-white/[0.05]">
            {reports.map((r, i) => (
              <motion.li key={r.id} initial={{ opacity: 0, x: i % 2 ? 16 : -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.4) }}>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-white/[0.03]" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-100">{r.network}</span>
                  {r.trains.length > 0 && <Badge tone="wait">{r.trains.length} train(s)</Badge>}
                  {r.lines.length > 0 && <Badge tone="info">{r.lines.length} ligne(s)</Badge>}
                  {r.stopAreas.length > 0 && <Badge>{r.stopAreas.length} gare(s)</Badge>}
                  <ChevronDown className={clsx('size-4 text-ink-500 transition-transform', open === r.id && 'rotate-180')} />
                </button>
                {open === r.id && (
                  <ul className="grid gap-1 px-3 pb-3 md:grid-cols-2">
                    {r.trains.map((vj) => {
                      const d = firstDisruption(vj.links);
                      const meta = effectMeta(d?.severity?.effect);
                      return (
                        <li key={vj.id}>
                          <Link to={`/train/${encodeURIComponent(vj.id)}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/[0.04]">
                            <span className="font-mono text-info-300">{vj.name}</span>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            <span className="min-w-0 flex-1 truncate text-xs text-ink-500">{d?.messages?.[0]?.text}</span>
                          </Link>
                        </li>
                      );
                    })}
                    {r.lines.map((l) => (
                      <li key={l.id}>
                        <Link to={`/lines/${encodeURIComponent(l.id)}`} className="block truncate rounded-md px-2 py-1.5 text-sm text-ink-200 hover:bg-white/[0.04]">
                          Ligne {l.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
        <Info className="size-3.5" /> Actualisé toutes les 60 secondes (cache serveur 30 s).
      </p>
    </>
  );
}
