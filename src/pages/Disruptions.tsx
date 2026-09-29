import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, Stat } from '@/components/ui/Card';
import { FilterChip, Segmented } from '@/components/ui/Segmented';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { DisruptionItem, disruptionReason, disruptionTarget, EFFECT_META, maxDelay } from '@/components/ui/DisruptionItem';
import { StatusBar } from '@/components/charts/StatusBar';
import { useDisruptionsList } from '@/api/hooks/disruptions';
import { parisYmd, toNavitiaDate } from '@/utils/navitiaDate';
import type { DisruptionEffect } from '@/types/navitia';

type Period = 'today' | 'next24' | 'week';

const TONE_COLOR = { alert: '#f8716c', wait: '#f7c257', info: '#4fd3ea', neutral: '#8d99ae', ok: '#4cd6a0' } as const;
const STATUS_LABEL = { active: 'En cours', future: 'À venir', past: 'Terminée' } as const;

function windowFor(p: Period): [string, string] {
  const bucket = Math.floor(Date.now() / 600_000) * 600_000; // créneaux de 10 min (cache partagé)
  const today = parisYmd();
  if (p === 'today') return [`${today}T000000`, `${today}T235959`];
  if (p === 'next24') return [toNavitiaDate(new Date(bucket)), toNavitiaDate(new Date(bucket + 24 * 3600_000))];
  return [toNavitiaDate(new Date(bucket - 7 * 24 * 3600_000)), toNavitiaDate(new Date(bucket))];
}

export default function DisruptionsPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [page, setPage] = useState(0);
  const [effects, setEffects] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [since, until] = windowFor(period);
  const q = useDisruptionsList(since, until, page, 100);
  const all = useMemo(() => q.data?.disruptions ?? [], [q.data]);

  const effectCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const d of all) c.set(d.severity?.effect ?? 'UNKNOWN_EFFECT', (c.get(d.severity?.effect ?? 'UNKNOWN_EFFECT') ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    return all.filter((d) => {
      if (effects.size && !effects.has(d.severity?.effect ?? 'UNKNOWN_EFFECT')) return false;
      if (statuses.size && !statuses.has(d.status)) return false;
      if (t) {
        const hay = `${disruptionReason(d)} ${disruptionTarget(d)?.label ?? ''} ${d.messages?.map((m) => m.text).join(' ') ?? ''}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [all, effects, statuses, text]);

  // Motifs les plus fréquents (l'API SNCF place le motif dans les messages)
  const topCauses = useMemo(() => {
    const c = new Map<string, number>();
    for (const d of all) {
      const r = disruptionReason(d);
      if (r !== 'Motif non communiqué') c.set(r, (c.get(r) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [all]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const n = new Set(set);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    setter(n);
  };

  const cancelled = all.filter((d) => d.severity?.effect === 'NO_SERVICE').length;
  const worst = Math.max(0, ...all.map(maxDelay));

  return (
    <>
      <PageHeader
        eyebrow="Module 6 · Temps réel"
        title="Perturbations"
        description="Suppressions, retards et modifications de service publiés en temps réel par la SNCF."
        endpoint="/disruptions?since=&until="
        actions={
          <Segmented
            value={period}
            onChange={(p) => {
              setPeriod(p);
              setPage(0);
            }}
            options={[
              { value: 'today', label: 'Aujourd’hui' },
              { value: 'next24', label: '24 h à venir' },
              { value: 'week', label: '7 derniers jours' },
            ]}
          />
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sur la période" value={q.data?.pagination?.total_result?.toLocaleString('fr-FR') ?? '…'} hint="perturbations publiées" />
        <Stat label="Suppressions" value={cancelled} tone={cancelled ? 'alert' : undefined} hint={`sur ${all.length} chargées`} />
        <Stat label="Retard max." value={worst ? `+${worst} min` : '—'} tone={worst >= 15 ? 'alert' : worst ? 'wait' : undefined} hint="observé sur un arrêt" />
        <Stat label="En cours" value={all.filter((d) => d.status === 'active').length} tone="info" hint="statut actif" />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Répartition par effet" eyebrow={`${all.length} perturbations chargées`}>
          <StatusBar
            segments={effectCounts.map(([e, v]) => ({
              key: e,
              label: EFFECT_META[e as DisruptionEffect]?.label ?? e,
              value: v,
              color: TONE_COLOR[EFFECT_META[e as DisruptionEffect]?.tone ?? 'neutral'],
            }))}
          />
        </Card>
        <Card title="Motifs fréquents">
          {topCauses.length === 0 ? (
            <p className="text-sm text-ink-500">Aucun motif communiqué.</p>
          ) : (
            <ul className="space-y-2">
              {topCauses.map(([c, n]) => (
                <li key={c} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink-300" title={c}>
                    {c}
                  </span>
                  <span className="font-mono text-xs text-ink-100">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
          <input className="input h-9 pl-9" placeholder="Motif, numéro de train, gare…" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {effectCounts.map(([e, n]) => (
            <FilterChip key={e} active={effects.has(e)} color={TONE_COLOR[EFFECT_META[e as DisruptionEffect]?.tone ?? 'neutral']} onClick={() => toggle(effects, setEffects, e)}>
              {EFFECT_META[e as DisruptionEffect]?.label ?? e} <span className="font-mono text-[10px] text-ink-500">{n}</span>
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          {(['active', 'future', 'past'] as const).map((s) => (
            <FilterChip key={s} active={statuses.has(s)} onClick={() => toggle(statuses, setStatuses, s)}>
              {STATUS_LABEL[s]}
            </FilterChip>
          ))}
        </div>
      </div>

      {q.isLoading && <SkeletonRows rows={8} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.isSuccess && filtered.length === 0 && (
        <div className="panel">
          <EmptyState icon={<AlertTriangle className="size-5" />} title="Aucune perturbation" description="Aucune perturbation ne correspond à ces filtres." />
        </div>
      )}
      <ul className="space-y-2">
        {filtered.map((d, i) => (
          <motion.li
            key={d.id}
            initial={{ opacity: 0, x: i % 2 ? 28 : -28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i * 0.02, 0.4), ease: [0.22, 1, 0.36, 1] }}
            className="panel px-4"
          >
            <DisruptionItem d={d} />
          </motion.li>
        ))}
      </ul>
      {q.data?.pagination && <Pagination page={page} total={q.data.pagination.total_result} perPage={100} onChange={setPage} />}
    </>
  );
}
