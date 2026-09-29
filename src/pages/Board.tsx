import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, Info, MonitorPlay, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StationPicker, useStationParam } from '@/components/StationPicker';
import { DeparturesBoard, toBoardRows } from '@/components/DeparturesBoard/DeparturesBoard';
import { ErrorState, EmptyState, SkeletonRows } from '@/components/ui/States';
import { FilterChip, Segmented } from '@/components/ui/Segmented';
import { LiveDot } from '@/components/ui/Badge';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { useBoard, type BoardType } from '@/api/hooks/schedules';
import { useStopArea } from '@/api/hooks/search';
import { useNow } from '@/utils/hooks';
import { formatTime } from '@/utils/navitiaDate';
import { MODE_META, type TrainMode } from '@/utils/modes';
import type { DataFreshness } from '@/types/navitia';

function Clock() {
  const now = useNow(1000);
  const s = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', second: '2-digit' }).format(now).padStart(2, '0');
  return (
    <div className="flex items-baseline gap-1 rounded-xl border border-white/[0.07] bg-[#050a16] px-4 py-2">
      <span className="led text-3xl font-black text-wait-300 tabular">{formatTime(now)}</span>
      <span className="led text-lg font-bold text-wait-500/70 tabular">{s}</span>
    </div>
  );
}

function RefreshRing({ updatedAt, period = 30_000, fetching }: { updatedAt: number; period?: number; fetching: boolean }) {
  const now = useNow(500).getTime();
  const left = Math.max(0, Math.ceil((updatedAt + period - now) / 1000));
  const ratio = updatedAt ? Math.min(1, (now - updatedAt) / period) : 0;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-400" title="Rafraîchissement automatique toutes les 30 s">
      <svg viewBox="0 0 20 20" className="size-4 -rotate-90">
        <circle cx="10" cy="10" r="8" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="2.5" />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="var(--color-info-400)"
          strokeWidth="2.5"
          strokeDasharray={`${ratio * 50.3} 50.3`}
          strokeLinecap="round"
        />
      </svg>
      {fetching ? 'Actualisation…' : `${left} s`}
    </span>
  );
}

export default function BoardPage() {
  const [params, setParams] = useSearchParams();
  const [stop] = useStationParam();
  const type = (params.get('type') === 'arrivals' ? 'arrivals' : 'departures') as BoardType;
  const [freshness, setFreshness] = useState<DataFreshness>('realtime');
  const [hidden, setHidden] = useState<Set<TrainMode>>(new Set());
  const sa = useStopArea(stop);
  const board = useBoard(stop, type, 40, freshness);

  const rows = useMemo(() => {
    const items = (type === 'departures' ? board.data?.departures : board.data?.arrivals) ?? [];
    return toBoardRows(items, board.data?.disruptions ?? [], type);
  }, [board.data, type]);
  const modes = useMemo(() => [...new Set(rows.map((r) => r.mode))], [rows]);
  const visible = rows.filter((r) => !hidden.has(r.mode));
  const delayed = rows.filter((r) => r.delay > 0).length;
  const cancelled = rows.filter((r) => r.cancelled).length;

  useEffect(() => setHidden(new Set()), [stop]);

  const setType = (t: BoardType) => {
    const next = new URLSearchParams(params);
    next.set('type', t);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Module 3 · Horaires temps réel"
        title={sa.data ? sa.data.name : 'Départs & arrivées'}
        description="Panneau d’affichage en gare, alimenté par l’API SNCF en temps réel et rafraîchi automatiquement toutes les 30 secondes."
        endpoint={['/stop_areas/{id}/departures', '/stop_areas/{id}/arrivals']}
        actions={
          <>
            {stop && sa.data && <FavoriteButton fav={{ kind: 'station', id: stop, name: sa.data.name }} />}
            <Clock />
          </>
        }
      />

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <StationPicker />
      </div>

      {!stop ? (
        <div className="panel">
          <EmptyState
            icon={<MonitorPlay className="size-5" />}
            title="Sélectionnez une gare"
            description="Recherchez une gare ou choisissez l’une des grandes gares ci-dessus pour afficher son panneau."
          />
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Segmented
              value={type}
              onChange={setType}
              label="Type de panneau"
              options={[
                { value: 'departures', label: <><ArrowUpFromLine className="size-3.5" /> Départs</> },
                { value: 'arrivals', label: <><ArrowDownToLine className="size-3.5" /> Arrivées</> },
              ]}
            />
            <Segmented
              size="sm"
              value={freshness}
              onChange={setFreshness}
              label="Fraîcheur des données"
              options={[
                { value: 'realtime', label: <><LiveDot /> Temps réel</> },
                { value: 'base_schedule', label: 'Théorique' },
              ]}
            />
            <div className="flex flex-wrap gap-1.5">
              {modes.map((m) => (
                <FilterChip
                  key={m}
                  color={MODE_META[m].color}
                  active={!hidden.has(m)}
                  onClick={() =>
                    setHidden((h) => {
                      const n = new Set(h);
                      if (n.has(m)) n.delete(m);
                      else n.add(m);
                      return n;
                    })
                  }
                >
                  {MODE_META[m].short}
                </FilterChip>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-4 text-xs">
              {delayed > 0 && <span className="text-alert-300">{delayed} en retard</span>}
              {cancelled > 0 && <span className="text-alert-300">{cancelled} supprimé(s)</span>}
              <RefreshRing updatedAt={board.dataUpdatedAt} fetching={board.isFetching} />
              <button className="text-ink-500 hover:text-ink-200" onClick={() => board.refetch()} aria-label="Actualiser maintenant">
                <RefreshCw className="size-3.5" />
              </button>
            </div>
          </div>

          {board.isLoading && <SkeletonRows rows={8} />}
          {board.isError && <ErrorState error={board.error} onRetry={() => board.refetch()} />}
          {board.isSuccess && visible.length === 0 && (
            <div className="panel">
              <EmptyState title="Aucun train à afficher" description="Aucune circulation prévue prochainement pour ces filtres." />
            </div>
          )}
          {visible.length > 0 && <DeparturesBoard rows={visible} type={type} />}

          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
            <Info className="size-3.5" />
            Le numéro de voie n’est pas diffusé par l’API SNCF. Cliquez sur un train pour voir sa marche complète.
            <Link to={`/stop-areas/${encodeURIComponent(stop)}`} className="ml-auto text-info-300 hover:text-info-400">
              Fiche gare →
            </Link>
          </p>
        </>
      )}
    </>
  );
}
