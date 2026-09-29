import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { motion, useDragControls, type PanInfo } from 'framer-motion';
import { useMediaQuery } from '@/utils/hooks';

/** Marges de recadrage de carte qui tiennent compte du panneau (à gauche sur desktop, en bas sur mobile). */
export function useMapPadding(side: 'left' | 'right' = 'left') {
  const desktop = useMediaQuery('(min-width: 1024px)');
  if (desktop) return side === 'left' ? { top: 60, bottom: 60, left: 440, right: 60 } : { top: 60, bottom: 60, left: 60, right: 420 };
  return { top: 40, bottom: typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.48) : 320, left: 24, right: 24 };
}

type Snap = 'peek' | 'half' | 'full';
const HEIGHTS: Record<Snap, string> = { peek: '96px', half: '46%', full: '88%' };
const ORDER: Snap[] = ['peek', 'half', 'full'];

/**
 * Panneau flottant au-dessus d'une carte :
 * colonne latérale sur desktop, bottom sheet à trois crans (réduit / mi-hauteur / plein) sur mobile.
 * Sur mobile, l'en-tête défile avec le contenu pour que les résultats restent accessibles.
 */
export function SidePanel({
  children,
  side = 'left',
  className,
  width = 380,
  header,
  initialSnap = 'half',
}: {
  children: ReactNode;
  side?: 'left' | 'right';
  className?: string;
  width?: number;
  header?: ReactNode;
  initialSnap?: Snap;
}) {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [snap, setSnap] = useState<Snap>(initialSnap);
  const controls = useDragControls();

  if (desktop) {
    return (
      <motion.aside
        key="desktop"
        initial={{ opacity: 0, x: side === 'left' ? -16 : 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        style={{ width }}
        className={clsx(
          'panel absolute top-4 bottom-4 z-10 flex flex-col overflow-hidden bg-night-800/85',
          side === 'left' ? 'left-4' : 'right-4',
          className,
        )}
      >
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </motion.aside>
    );
  }

  const step = (dir: 1 | -1) => setSnap((s) => ORDER[Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(s) + dir))]!);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y < -40 || info.velocity.y < -300) step(1);
    else if (info.offset.y > 40 || info.velocity.y > 300) step(-1);
  };

  return (
    <motion.aside
      key="mobile"
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.15}
      onDragEnd={onDragEnd}
      initial={{ height: HEIGHTS.peek }}
      animate={{ height: HEIGHTS[snap] }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className={clsx(
        'absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-2xl border-t border-white/[0.08] bg-night-800/95 shadow-[var(--shadow-pop)] backdrop-blur-xl',
        className,
      )}
    >
      <button
        type="button"
        aria-label={snap === 'full' ? 'Réduire le panneau' : 'Agrandir le panneau'}
        onPointerDown={(e) => controls.start(e)}
        onClick={() => setSnap((s) => (s === 'full' ? 'half' : s === 'half' ? 'full' : 'half'))}
        className="flex w-full shrink-0 touch-none justify-center py-3"
      >
        <span className="h-1 w-10 rounded-full bg-white/25" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {header}
        {children}
      </div>
    </motion.aside>
  );
}
