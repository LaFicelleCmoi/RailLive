import clsx from 'clsx';
import { classifyMode, displayColor, MODE_META, type TrainMode } from '@/utils/modes';

/** Pastille de mode + numéro/code (TGV 6603, TER 858308, RER A…). */
export function ModeBadge({
  commercialMode,
  network,
  physicalMode,
  code,
  color,
  textColor,
  mode: forced,
  className,
}: {
  commercialMode?: string;
  network?: string;
  physicalMode?: string;
  code?: string;
  color?: string;
  textColor?: string;
  mode?: TrainMode;
  className?: string;
}) {
  const mode = forced ?? classifyMode(commercialMode, network, physicalMode);
  const hasOfficial = !!color && /^#?[0-9a-f]{6}$/i.test(color);
  const bg = displayColor(color, mode);
  const label = commercialMode && commercialMode.length <= 12 ? commercialMode : MODE_META[mode].short;

  return (
    <span className={clsx('inline-flex items-center overflow-hidden rounded-md text-[11px] font-bold tracking-wide whitespace-nowrap ring-1 ring-white/10 ring-inset', className)}>
      <span
        className="px-1.5 py-0.5"
        style={
          hasOfficial
            ? { backgroundColor: bg, color: textColor ? `#${textColor.replace('#', '')}` : '#fff' }
            : { backgroundColor: `${bg}26`, color: bg }
        }
      >
        {hasOfficial && code ? code : label}
      </span>
      {code && !hasOfficial && <span className="bg-white/[0.04] px-1.5 py-0.5 font-mono text-ink-200">{code}</span>}
    </span>
  );
}
