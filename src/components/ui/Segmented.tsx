import clsx from 'clsx';
import { motion } from 'framer-motion';
import { useId, type ReactNode } from 'react';

/** Sélecteur segmenté (onglets compacts). */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={clsx('inline-flex max-w-full overflow-x-auto rounded-lg border border-white/[0.08] bg-night-900/60 p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            type="button"
            onClick={() => onChange(o.value)}
            className={clsx(
              'relative rounded-md font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              active ? 'text-ink-50' : 'text-ink-400 hover:text-ink-200',
            )}
          >
            {active && (
              <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-md bg-white/[0.09] ring-1 ring-white/10" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
            )}
            <span className="relative inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Puce de filtre activable. */
export function FilterChip({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  color?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all sm:py-1',
        active ? 'border-white/15 bg-white/[0.07] text-ink-50' : 'border-white/[0.06] text-ink-500 hover:text-ink-300',
      )}
    >
      {color && <span className="size-2 rounded-full transition-opacity" style={{ background: color, opacity: active ? 1 : 0.35 }} />}
      {children}
    </button>
  );
}
