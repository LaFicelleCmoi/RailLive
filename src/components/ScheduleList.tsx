import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import type { StopSchedule } from '@/types/navitia';
import { ModeBadge } from './ui/ModeBadge';
import { delayMinutes, navitiaTime } from '@/utils/navitiaDate';
import { cleanName } from './DeparturesBoard/DeparturesBoard';

/** Liste de fiches horaires (stop_schedules / terminus_schedules). */
export function ScheduleList({ items, groupLabel }: { items: StopSchedule[]; groupLabel?: (s: StopSchedule) => string }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((s, i) => {
        const di = s.display_informations;
        const times = s.date_times.filter((t) => t.date_time);
        const lineLink = s.route?.line?.id ?? di.links?.find((l) => l.type === 'line')?.id;
        return (
          <motion.li
            key={`${s.route?.id}-${i}`}
            initial={{ opacity: 0, x: i % 2 ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.35 }}
            className="panel p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ModeBadge commercialMode={di.commercial_mode} network={di.network} physicalMode={di.physical_mode} code={di.code || undefined} color={di.color} textColor={di.text_color} />
                  {lineLink && (
                    <Link to={`/lines/${encodeURIComponent(lineLink)}`} className="truncate text-xs text-ink-500 hover:text-info-300">
                      {di.name}
                    </Link>
                  )}
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ink-100">
                  <ArrowRight className="size-3.5 shrink-0 text-ink-500" />
                  <span className="truncate">{groupLabel ? groupLabel(s) : cleanName(di.direction)}</span>
                </p>
              </div>
              {s.additional_informations && <span className="shrink-0 text-[10px] tracking-wider text-ink-500 uppercase">{s.additional_informations.replace(/_/g, ' ')}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {times.length === 0 && <span className="text-xs text-ink-500">Aucun passage prochainement</span>}
              {times.map((t, j) => {
                const delay = delayMinutes(t.base_date_time, t.date_time);
                const vj = t.links?.find((l) => l.type === 'vehicle_journey')?.id;
                const chip = (
                  <span
                    className={clsx(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-sm tabular ring-1 ring-inset transition-colors',
                      delay > 0 ? 'bg-alert-500/10 text-alert-300 ring-alert-500/25' : 'bg-white/[0.04] text-ink-100 ring-white/[0.07]',
                      vj && 'hover:ring-info-500/50',
                    )}
                    title={delay > 0 ? `Prévu ${navitiaTime(t.base_date_time)}, retard ${delay} min` : undefined}
                  >
                    {navitiaTime(t.date_time)}
                    {delay > 0 && <span className="text-[10px]">+{delay}</span>}
                  </span>
                );
                return vj ? (
                  <Link key={j} to={`/train/${encodeURIComponent(vj)}`}>
                    {chip}
                  </Link>
                ) : (
                  <span key={j}>{chip}</span>
                );
              })}
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}
