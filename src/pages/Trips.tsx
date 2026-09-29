import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Hash, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { CalendarGrid } from '@/components/CalendarGrid/CalendarGrid';
import { useRunningTrains, useTrainsByNumber } from '@/api/hooks/trains';
import { useRegion } from '@/api/hooks/meta';
import { formatHms, parisYmd, toNavitiaDate } from '@/utils/navitiaDate';
import type { VehicleJourney } from '@/types/navitia';

const PHYSICAL = [
  { value: 'physical_mode:LongDistanceTrain', label: 'Grandes lignes' },
  { value: 'physical_mode:Train', label: 'TER' },
  { value: 'physical_mode:RapidTransit', label: 'RER / Transilien' },
];

function dateOf(id: string) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(id);
  return m ? `${m[1]}${m[2]}${m[3]}` : '';
}

function VjRow({ vj, i }: { vj: VehicleJourney; i: number }) {
  const first = vj.stop_times[0];
  const last = vj.stop_times[vj.stop_times.length - 1];
  const d = dateOf(vj.id);
  return (
    <motion.li initial={{ opacity: 0, x: i % 2 ? 16 : -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}>
      <Link to={`/train/${encodeURIComponent(vj.id)}`} className="group grid grid-cols-[72px_1fr_auto] items-center gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
        <span className="font-mono text-sm font-semibold text-info-300">{vj.trip?.name ?? vj.name}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-2 truncate text-sm text-ink-100">
            {first?.stop_point.name} <ArrowRight className="size-3.5 shrink-0 text-ink-500" /> {last?.stop_point.name}
          </span>
          <span className="font-mono text-[11px] text-ink-500">
            {formatHms(first?.departure_time)} → {formatHms(last?.arrival_time)} · {vj.stop_times.length} arrêts
          </span>
        </span>
        <span className="font-mono text-[11px] text-ink-500">{d ? `${d.slice(6, 8)}/${d.slice(4, 6)}` : ''}</span>
      </Link>
    </motion.li>
  );
}

export default function TripsPage() {
  const [params, setParams] = useSearchParams();
  const number = params.get('n') ?? undefined;
  const [text, setText] = useState(number ?? '');
  const [physical, setPhysical] = useState(PHYSICAL[0]!.value);
  const [page, setPage] = useState(0);
  const byNumber = useTrainsByNumber(number);
  const region = useRegion();

  // Fenêtre « en circulation » arrondie à 5 min pour mutualiser le cache
  const window5 = Math.floor(Date.now() / 300_000) * 300_000;
  const since = toNavitiaDate(new Date(window5 - 30 * 60_000));
  const until = toNavitiaDate(new Date(window5 + 30 * 60_000));
  const running = useRunningTrains(physical, since, until, page);

  const sorted = useMemo(() => [...(byNumber.data ?? [])].sort((a, b) => dateOf(a.id).localeCompare(dateOf(b.id))), [byNumber.data]);
  const days = useMemo(() => new Set(sorted.map((v) => dateOf(v.id))), [sorted]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    setParams(v ? { n: v } : {});
  };

  return (
    <>
      <PageHeader
        eyebrow="Module 4 · Trains"
        title="Circulations"
        description="Retrouvez un train par son numéro, ses jours de circulation, ou parcourez les trains en circulation en ce moment."
        endpoint={['/vehicle_journeys?headsign=', '/physical_modes/{id}/vehicle_journeys', '/trips']}
      />

      <form onSubmit={submit} className="panel mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="num">
            Numéro de train
          </label>
          <div className="relative">
            <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
            <input id="num" className="input h-12 pl-9 font-mono text-base" placeholder="6603, 858308, 3657…" value={text} onChange={(e) => setText(e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <Button type="submit" variant="primary" size="lg" icon={<Search className="size-4" />} loading={byNumber.isFetching}>
          Rechercher
        </Button>
      </form>

      {number && (
        <div className="mb-6 grid gap-5 lg:grid-cols-[1fr_420px]">
          <Card title={`Train ${number}`} eyebrow={`${sorted.length} circulation(s)`}>
            {byNumber.isLoading && <SkeletonRows rows={4} />}
            {byNumber.isError && <ErrorState error={byNumber.error} />}
            {byNumber.isSuccess && sorted.length === 0 && <EmptyState title="Aucun train avec ce numéro" description="Vérifiez le numéro (TGV : 4 chiffres, TER : 5 à 6 chiffres)." />}
            <ul className="-mx-3 max-h-[480px] overflow-y-auto">
              {sorted.map((vj, i) => (
                <VjRow key={vj.id} vj={vj} i={i} />
              ))}
            </ul>
          </Card>
          <Card title="Jours de circulation">
            {region.data && <CalendarGrid activeDays={days} range={[region.data.start_production_date, region.data.end_production_date]} highlight={parisYmd()} />}
          </Card>
        </div>
      )}

      <Card
        title="En circulation maintenant"
        eyebrow="Trains ayant un arrêt dans la fenêtre ±30 min"
        actions={
          <Segmented
            size="sm"
            value={physical}
            onChange={(v) => {
              setPhysical(v);
              setPage(0);
            }}
            options={PHYSICAL}
          />
        }
      >
        {running.isLoading && <SkeletonRows rows={6} />}
        {running.isError && <ErrorState error={running.error} onRetry={() => running.refetch()} />}
        <ul className="-mx-3">
          {(running.data?.vehicle_journeys ?? []).map((vj, i) => (
            <VjRow key={vj.id} vj={vj} i={i} />
          ))}
        </ul>
        {running.data?.pagination && <Pagination page={page} total={running.data.pagination.total_result} perPage={25} onChange={setPage} />}
      </Card>
    </>
  );
}
