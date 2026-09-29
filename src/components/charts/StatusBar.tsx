import { useState } from 'react';
import clsx from 'clsx';

export interface StatusSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Barre de répartition (100 %) : segments séparés par un espace de 2 px,
 * légende toujours visible (l'identité ne repose jamais sur la seule couleur),
 * info-bulle au survol.
 */
export function StatusBar({ segments, total }: { segments: StatusSegment[]; total?: number }) {
  const sum = total ?? segments.reduce((s, x) => s + x.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  const shown = segments.filter((s) => s.value > 0);
  if (!sum) return <p className="text-sm text-ink-500">Aucune donnée.</p>;
  return (
    <div>
      <div className="relative flex h-3 gap-[2px] overflow-visible" role="img" aria-label={shown.map((s) => `${s.label} ${s.value}`).join(', ')}>
        {shown.map((s, i) => (
          <div
            key={s.key}
            className={clsx('relative h-full transition-opacity', i === 0 && 'rounded-l', i === shown.length - 1 && 'rounded-r', hover && hover !== s.key && 'opacity-40')}
            style={{ width: `${(s.value / sum) * 100}%`, background: s.color, minWidth: 4 }}
            onPointerEnter={() => setHover(s.key)}
            onPointerLeave={() => setHover(null)}
          >
            {hover === s.key && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-md border border-white/10 bg-night-700 px-2 py-1 text-xs whitespace-nowrap text-ink-100 shadow-lg">
                {s.label} · <span className="font-mono">{s.value}</span> ({Math.round((s.value / sum) * 100)} %)
              </div>
            )}
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-400">
        {shown.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="font-mono text-ink-200">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
