import clsx from 'clsx';
import { parisDate, parisYmd } from '@/utils/navitiaDate';

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

/**
 * Calendrier visuel des jours de circulation.
 * `activeDays` : ensemble de dates YYYYMMDD ; `range` : période couverte par les données.
 */
export function CalendarGrid({ activeDays, range, highlight }: { activeDays: Set<string>; range: [string, string]; highlight?: string }) {
  const today = parisYmd();
  const start = parisDate(+range[0].slice(0, 4), +range[0].slice(4, 6), 1, 12);
  const end = parisDate(+range[1].slice(0, 4), +range[1].slice(4, 6), +range[1].slice(6, 8), 12);

  const months: { label: string; cells: (string | null)[] }[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const first = new Date(Date.UTC(y, m, 1, 12));
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate();
    const offset = (first.getUTCDay() + 6) % 7;
    const cells: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(`${y}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`);
    months.push({ label: monthFmt.format(first), cells });
    cursor.setUTCMonth(m + 1, 1);
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {months.map((mo) => (
        <div key={mo.label}>
          <p className="mb-2 text-xs font-semibold text-ink-300 capitalize">{mo.label}</p>
          <div className="grid grid-cols-7 gap-1 text-center">
            {DAYS.map((d, i) => (
              <span key={i} className="text-[10px] font-medium text-ink-600">
                {d}
              </span>
            ))}
            {mo.cells.map((c, i) => {
              if (!c) return <span key={i} />;
              const inRange = c >= range[0] && c <= range[1];
              const active = activeDays.has(c);
              return (
                <span
                  key={i}
                  title={active ? 'Circule' : inRange ? 'Ne circule pas' : 'Hors période de données'}
                  className={clsx(
                    'grid aspect-square place-items-center rounded-md font-mono text-[11px] tabular transition-colors',
                    active ? 'bg-info-500/20 font-semibold text-info-300 ring-1 ring-info-500/30 ring-inset' : inRange ? 'bg-white/[0.03] text-ink-500' : 'text-ink-600 opacity-40',
                    c === highlight && 'ring-2 ring-wait-400',
                    c === today && 'underline decoration-wait-400 underline-offset-2',
                  )}
                >
                  {+c.slice(6, 8)}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
