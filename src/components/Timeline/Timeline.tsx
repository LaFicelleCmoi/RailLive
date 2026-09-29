import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { formatTime } from '@/utils/navitiaDate';

export interface TimelineItem {
  key: string;
  name: string;
  href?: string;
  baseArr: Date;
  baseDep: Date;
  arr: Date;
  dep: Date;
  delay: number;
  deleted?: boolean;
  added?: boolean;
  cause?: string;
}

/**
 * Timeline verticale des arrêts : heures théoriques et réelles, arrêts passés,
 * position estimée du train entre deux gares.
 */
export function Timeline({ items, now, color = '#4fd3ea', compact }: { items: TimelineItem[]; now: Date; color?: string; compact?: boolean }) {
  const t = now.getTime();
  // Index du dernier arrêt dont le départ est passé
  let lastPassed = -1;
  items.forEach((s, i) => {
    if (!s.deleted && s.dep.getTime() <= t) lastPassed = i;
  });
  const next = items.findIndex((s, i) => i > lastPassed && !s.deleted);
  const atStation = lastPassed >= 0 && items[lastPassed]!.arr.getTime() <= t && items[lastPassed]!.dep.getTime() > t;
  let progress = 0;
  if (lastPassed >= 0 && next > 0) {
    const a = items[lastPassed]!.dep.getTime();
    const b = items[next]!.arr.getTime();
    progress = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
  }

  return (
    <ol className="relative">
      {items.map((s, i) => {
        const first = i === 0;
        const last = i === items.length - 1;
        const passed = i <= lastPassed;
        const isCurrentSegment = i === lastPassed && next > i;
        const showArr = !first;
        const showDep = !last;
        const baseTime = showArr ? s.baseArr : s.baseDep;
        const realTime = showArr ? s.arr : s.dep;
        const late = s.delay > 0 && !s.deleted;

        return (
          <li key={s.key} className={clsx('relative grid grid-cols-[56px_24px_1fr] gap-x-2', compact ? 'min-h-11' : 'min-h-14')}>
            {/* Heures */}
            <div className="pt-0.5 text-right">
              <p className={clsx('font-mono text-sm tabular', s.deleted ? 'text-ink-600 line-through' : late ? 'text-ink-500 line-through' : passed ? 'text-ink-400' : 'text-ink-50')}>
                {formatTime(baseTime)}
              </p>
              {late && <p className="font-mono text-sm font-semibold text-alert-400 tabular">{formatTime(realTime)}</p>}
            </div>

            {/* Rail */}
            <div className="relative flex justify-center">
              {!last && (
                <span className="absolute top-3 bottom-0 w-[3px] rounded-full bg-white/[0.08]">
                  {(passed || isCurrentSegment) && (
                    <motion.span
                      className="absolute inset-x-0 top-0 rounded-full"
                      style={{ background: color }}
                      initial={false}
                      animate={{ height: isCurrentSegment ? `${progress * 100}%` : '100%' }}
                      transition={{ duration: 0.8 }}
                    />
                  )}
                </span>
              )}
              <span
                className={clsx('relative z-10 mt-1 rounded-full border-2', first || last ? 'size-3.5' : 'size-3', s.deleted && 'border-dashed')}
                style={{
                  borderColor: s.deleted ? '#4a566b' : passed ? color : 'rgb(255 255 255 / 0.3)',
                  background: passed && !s.deleted ? color : '#0e1524',
                }}
              />
              {isCurrentSegment && !atStation && (
                <span
                  className="absolute left-1/2 z-20 size-4 -translate-x-1/2 rounded-full border-2 border-night-900"
                  style={{ top: `calc(12px + ${progress} * (100% - 12px))`, background: color, boxShadow: `0 0 0 4px ${color}33, 0 0 14px ${color}` }}
                  aria-label="Position estimée"
                />
              )}
            </div>

            {/* Gare */}
            <div className={clsx('min-w-0', compact ? 'pb-3' : 'pb-4')}>
              <div className="flex flex-wrap items-center gap-2">
                {s.href ? (
                  <Link to={s.href} className={clsx('truncate text-sm font-medium hover:text-info-300', s.deleted ? 'text-ink-500 line-through' : passed ? 'text-ink-400' : 'text-ink-100')}>
                    {s.name}
                  </Link>
                ) : (
                  <span className={clsx('truncate text-sm font-medium', s.deleted ? 'text-ink-500 line-through' : passed ? 'text-ink-400' : 'text-ink-100')}>{s.name}</span>
                )}
                {late && <span className="rounded bg-alert-500/12 px-1.5 text-[10px] font-bold text-alert-300">+{s.delay} min</span>}
                {s.deleted && <span className="rounded bg-alert-500/12 px-1.5 text-[10px] font-bold text-alert-300">Arrêt supprimé</span>}
                {s.added && <span className="rounded bg-info-500/12 px-1.5 text-[10px] font-bold text-info-300">Arrêt ajouté</span>}
                {atStation && i === lastPassed && <span className="rounded bg-info-500/12 px-1.5 text-[10px] font-bold text-info-300">À quai</span>}
              </div>
              {!compact && showArr && showDep && s.dep.getTime() - s.arr.getTime() >= 60_000 && (
                <p className="text-[11px] text-ink-500">
                  Arrêt {Math.round((s.dep.getTime() - s.arr.getTime()) / 60_000)} min · départ {formatTime(s.dep)}
                </p>
              )}
              {!compact && s.cause && <p className="text-[11px] text-wait-300/90">{s.cause}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
