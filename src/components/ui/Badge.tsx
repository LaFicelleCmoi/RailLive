import type { ReactNode } from 'react';
import clsx from 'clsx';

export type Tone = 'neutral' | 'info' | 'wait' | 'alert' | 'ok';

const tones: Record<Tone, string> = {
  neutral: 'bg-white/[0.06] text-ink-300 ring-white/10',
  info: 'bg-info-500/12 text-info-300 ring-info-500/25',
  wait: 'bg-wait-500/12 text-wait-300 ring-wait-500/25',
  alert: 'bg-alert-500/14 text-alert-300 ring-alert-500/30',
  ok: 'bg-ok-500/12 text-ok-400 ring-ok-500/25',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Pastille de ligne avec la couleur officielle. */
export function LineBadge({
  code,
  color,
  textColor,
  className,
}: {
  code: string;
  color?: string;
  textColor?: string;
  className?: string;
}) {
  const bg = color ? `#${color.replace('#', '')}` : '#3b4760';
  const fg = textColor ? `#${textColor.replace('#', '')}` : '#ffffff';
  return (
    <span
      className={clsx(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[11px] font-bold tracking-wide whitespace-nowrap',
        className,
      )}
      style={{ backgroundColor: bg, color: fg, boxShadow: `0 0 0 1px rgb(255 255 255 / 0.08) inset` }}
    >
      {code}
    </span>
  );
}

/** Point « en direct » discret. */
export function LiveDot({ className, tone = 'info' }: { className?: string; tone?: 'info' | 'alert' | 'ok' }) {
  const color = tone === 'alert' ? 'bg-alert-400' : tone === 'ok' ? 'bg-ok-400' : 'bg-info-400';
  return (
    <span className={clsx('relative inline-flex size-2', className)} aria-hidden>
      <span className={clsx('absolute inset-0 animate-pulse-soft rounded-full opacity-60', color)} />
      <span className={clsx('relative size-2 rounded-full', color)} style={{ boxShadow: '0 0 8px currentColor' }} />
    </span>
  );
}
