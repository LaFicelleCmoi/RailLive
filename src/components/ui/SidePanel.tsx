import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { motion, useDragControls, type PanInfo } from 'framer-motion';
import { useMediaQuery } from '@/utils/hooks';

/**
 * Panneau flottant au-dessus d'une carte :
 * colonne latérale sur desktop, bottom sheet déplaçable sur mobile.
 */
export function SidePanel({
  children,
  side = 'left',
  className,
  width = 380,
  header,
}: {
  children: ReactNode;
  side?: 'left' | 'right';
  className?: string;
  width?: number;
  header?: ReactNode;
}) {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [expanded, setExpanded] = useState(false);
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

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y < -40 || info.velocity.y < -300) setExpanded(true);
    else if (info.offset.y > 40 || info.velocity.y > 300) setExpanded(false);
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
      animate={{ height: expanded ? '82%' : '38%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className={clsx(
        'absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-2xl border-t border-white/[0.08] bg-night-800/95 shadow-[var(--shadow-pop)] backdrop-blur-xl',
        className,
      )}
    >
      <button
        type="button"
        aria-label={expanded ? 'Réduire le panneau' : 'Agrandir le panneau'}
        onPointerDown={(e) => controls.start(e)}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full shrink-0 touch-none justify-center py-2.5"
      >
        <span className="h-1 w-10 rounded-full bg-white/20" />
      </button>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </motion.aside>
  );
}
