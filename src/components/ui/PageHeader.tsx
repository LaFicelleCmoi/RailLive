import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  endpoint,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Endpoint(s) Navitia exploités, affichés en discret */
  endpoint?: string | string[];
}) {
  const endpoints = endpoint ? (Array.isArray(endpoint) ? endpoint : [endpoint]) : [];
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
    >
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50 md:text-[28px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-400">{description}</p>}
        {endpoints.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {endpoints.map((e) => (
              <code
                key={e}
                className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-ink-500"
              >
                {e}
              </code>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
}
