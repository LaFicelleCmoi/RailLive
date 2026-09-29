import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { Departure, Disruption } from '@/types/navitia';
import { delayMinutes, navitiaTime, parseNavitiaDate } from '@/utils/navitiaDate';
import { classifyMode, MODE_META, type TrainMode } from '@/utils/modes';
import { effectMeta } from '@/components/ui/DisruptionItem';
import type { BoardType } from '@/api/hooks/schedules';

export interface BoardRow {
  key: string;
  time: string;
  baseTime: string;
  delay: number;
  cancelled: boolean;
  mode: TrainMode;
  brand: string;
  number: string;
  destination: string;
  line: string;
  vjId?: string;
  realtime: boolean;
  disruption?: Disruption;
  timestamp: number;
}

/** Retire le suffixe « (Ville) » des libellés de l'API. */
export const cleanName = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '').trim();

export function toBoardRows(items: Departure[], disruptions: Disruption[], type: BoardType): BoardRow[] {
  const byId = new Map(disruptions.map((d) => [d.id, d]));
  return items.map((d, i) => {
    const di = d.display_informations;
    const sdt = d.stop_date_time;
    const real = type === 'departures' ? sdt.departure_date_time : sdt.arrival_date_time;
    const base = (type === 'departures' ? sdt.base_departure_date_time : sdt.base_arrival_date_time) ?? real;
    const dis = [...(di.links ?? []), ...(d.links ?? []), ...(sdt.links ?? [])]
      .filter((l) => l.type === 'disruption' && l.id)
      .map((l) => byId.get(l.id!))
      .find(Boolean);
    const cancelled =
      dis?.severity?.effect === 'NO_SERVICE' || (sdt.additional_informations ?? []).some((x) => /deleted|no_(departing|arriving)/i.test(x));
    return {
      key: `${d.links?.find((l) => l.type === 'vehicle_journey')?.id ?? i}-${real}`,
      time: navitiaTime(real),
      baseTime: navitiaTime(base),
      delay: delayMinutes(base, real),
      cancelled,
      mode: classifyMode(di.commercial_mode, di.network, di.physical_mode),
      brand: di.commercial_mode || di.network,
      number: di.trip_short_name || di.headsign || di.code,
      destination: cleanName(di.direction || di.label || ''),
      line: di.name,
      vjId: d.links?.find((l) => l.type === 'vehicle_journey')?.id,
      realtime: sdt.data_freshness === 'realtime',
      disruption: dis,
      timestamp: parseNavitiaDate(real)?.getTime() ?? 0,
    };
  });
}

function Status({ row }: { row: BoardRow }) {
  if (row.cancelled) return <span className="led rounded bg-alert-500/15 px-1.5 py-0.5 text-[13px] font-bold text-alert-400">SUPPRIMÉ</span>;
  if (row.delay >= 1)
    return <span className="led rounded bg-alert-500/12 px-1.5 py-0.5 text-[13px] font-bold text-alert-400 tabular">+{row.delay} MIN</span>;
  if (row.disruption) {
    const m = effectMeta(row.disruption.severity?.effect);
    return <span className="text-[11px] font-semibold text-wait-300 uppercase">{m.label}</span>;
  }
  return <span className="text-[11px] font-medium tracking-wider text-ok-400/80 uppercase">à l’heure</span>;
}

/** Panneau façon gare : police LED, retards en rouge, voie non fournie par l'API SNCF. */
export function DeparturesBoard({ rows, type }: { rows: BoardRow[]; type: BoardType }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => a.timestamp - b.timestamp), [rows]);
  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-white/[0.07] bg-[#050a16] shadow-[var(--shadow-panel)]">
      <div className="hidden grid-cols-[92px_110px_150px_1fr_64px_28px] gap-4 border-b border-white/[0.06] bg-white/[0.02] px-5 py-2.5 md:grid">
        {['Heure', 'État', 'Train', type === 'departures' ? 'Destination' : 'Terminus', 'Voie', ''].map((h) => (
          <span key={h} className="eyebrow text-[10px]">
            {h}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-white/[0.045]">
        <AnimatePresence initial={false}>
          {sorted.map((r, i) => {
            const content = (
              <>
                <div className="flex items-baseline gap-2">
                  <span className={clsx('led text-[26px] leading-none font-black tabular', r.cancelled ? 'text-ink-500 line-through' : r.delay > 0 ? 'text-alert-400' : 'text-wait-300')}>
                    {r.delay > 0 && !r.cancelled ? r.time : r.baseTime}
                  </span>
                  {r.delay > 0 && !r.cancelled && <span className="font-mono text-xs text-ink-500 line-through">{r.baseTime}</span>}
                </div>
                <div className="hidden md:block">
                  <Status row={r} />
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap uppercase"
                    style={{ background: `${MODE_META[r.mode].color}22`, color: MODE_META[r.mode].color }}
                    title={r.brand}
                  >
                    {r.brand.length > 10 ? MODE_META[r.mode].short : r.brand}
                  </span>
                  <span className="font-mono text-sm text-ink-200">{r.number}</span>
                </div>
                <div className="min-w-0">
                  <p className={clsx('led truncate text-[19px] leading-tight font-bold uppercase', r.cancelled ? 'text-ink-500' : 'text-ink-50')}>{r.destination}</p>
                  <div className="mt-1 flex items-center gap-2 md:hidden">
                    <Status row={r} />
                  </div>
                  {r.disruption && !r.cancelled && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-wait-300/90">
                      <AlertTriangle className="size-3 shrink-0" />
                      {r.disruption.messages?.[0]?.text ?? effectMeta(r.disruption.severity?.effect).label}
                    </p>
                  )}
                </div>
                <span className="led hidden text-center text-lg text-ink-500 md:block" title="Voie non fournie par l’API SNCF">
                  —
                </span>
                <ChevronRight className="hidden size-4 text-ink-600 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-300 md:block" />
              </>
            );
            const cls =
              'group grid grid-cols-[88px_1fr] items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors md:grid-cols-[92px_110px_150px_1fr_64px_28px] md:gap-4';
            return (
              <motion.li
                key={r.key}
                layout="position"
                initial={{ opacity: 0, x: i % 2 ? 24 : -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.025, 0.4), ease: [0.22, 1, 0.36, 1] }}
                className={clsx(i % 2 && 'bg-white/[0.012]')}
              >
                {r.vjId ? (
                  <Link to={`/train/${encodeURIComponent(r.vjId)}`} className={clsx(cls, 'hover:bg-white/[0.035]')}>
                    {content}
                  </Link>
                ) : (
                  <div className={cls}>{content}</div>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
