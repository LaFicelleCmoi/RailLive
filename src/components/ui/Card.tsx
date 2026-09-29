import type { ReactNode } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

export function Card({
  title,
  eyebrow,
  actions,
  children,
  className,
  bodyClassName,
  delay = 0,
}: {
  title?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className={clsx('panel overflow-hidden', className)}
    >
      {(title || actions || eyebrow) && (
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-0.5 text-[10px]">{eyebrow}</p>}
            {title && <h2 className="truncate text-sm font-semibold text-ink-100">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx('p-5', bodyClassName)}>{children}</div>
    </motion.section>
  );
}

/** Indicateur chiffré (KPI). */
export function Stat({
  label,
  value,
  hint,
  tone,
  size = 'md',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'info' | 'wait' | 'alert' | 'ok';
  size?: 'sm' | 'md';
}) {
  const color =
    tone === 'alert' ? 'text-alert-300' : tone === 'wait' ? 'text-wait-300' : tone === 'ok' ? 'text-ok-400' : tone === 'info' ? 'text-info-300' : 'text-ink-50';
  return (
    <div className={clsx('panel', size === 'sm' ? 'p-3' : 'p-4')}>
      <p className="eyebrow truncate text-[10px]">{label}</p>
      <p className={clsx('mt-1.5 font-mono font-semibold whitespace-nowrap tabular', size === 'sm' ? 'text-base' : 'text-2xl', color)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

/** Liste clé / valeur. */
export function DefinitionList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-white/[0.05] text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2">
          <dt className="shrink-0 text-ink-500">{k}</dt>
          <dd className="min-w-0 text-right break-words text-ink-200">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
