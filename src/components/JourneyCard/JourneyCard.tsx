import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowLeftRight, Bike, Car, ChevronDown, Clock, Footprints, Hourglass, Leaf, TrainFront } from 'lucide-react';
import type { Journey, Section } from '@/types/navitia';
import { ModeBadge } from '../ui/ModeBadge';
import { Badge } from '../ui/Badge';
import { delayMinutes, formatDuration, navitiaTime } from '@/utils/navitiaDate';
import { JOURNEY_TAG, journeyDelay, ptSections, sectionColor, STREET_MODE_LABEL } from './journeyUtils';
import { cleanName } from '../DeparturesBoard/DeparturesBoard';

function StreetIcon({ mode, className = 'size-3.5' }: { mode?: string; className?: string }) {
  if (mode === 'bike' || mode === 'bss') return <Bike className={className} />;
  if (mode === 'car' || mode === 'ridesharing' || mode === 'taxi') return <Car className={className} />;
  return <Footprints className={className} />;
}

function SectionRow({ s }: { s: Section }) {
  const color = sectionColor(s);
  if (s.type === 'public_transport' && s.display_informations) {
    const di = s.display_informations;
    const stops = s.stop_date_times ?? [];
    const delay = delayMinutes(s.base_arrival_date_time, s.arrival_date_time);
    const vj = s.links?.find((l) => l.type === 'vehicle_journey')?.id;
    return (
      <li className="relative pl-6">
        <span className="absolute top-2 bottom-2 left-[7px] w-[3px] rounded-full" style={{ background: color }} />
        <span className="absolute top-1.5 left-0.5 size-3.5 rounded-full border-[3px] bg-night-800" style={{ borderColor: color }} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-ink-50 tabular">{navitiaTime(s.departure_date_time)}</span>
          <span className="text-sm text-ink-100">{cleanName(s.from?.name ?? '')}</span>
        </div>
        <div className="my-2 flex flex-wrap items-center gap-2 text-xs text-ink-400">
          <ModeBadge commercialMode={di.commercial_mode} network={di.network} physicalMode={di.physical_mode} code={di.trip_short_name || di.code} color={di.color} textColor={di.text_color} />
          <span>direction {cleanName(di.direction)}</span>
          <span className="text-ink-600">·</span>
          <span>{formatDuration(s.duration)}</span>
          {stops.length > 2 && <span className="text-ink-600">· {stops.length - 2} arrêt(s) intermédiaire(s)</span>}
          {delay > 0 && <Badge tone="alert">+{delay} min</Badge>}
          {vj && (
            <Link to={`/train/${encodeURIComponent(vj)}`} className="text-info-300 hover:text-info-400">
              Voir le train →
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-ink-50 tabular">{navitiaTime(s.arrival_date_time)}</span>
          <span className="text-sm text-ink-100">{cleanName(s.to?.name ?? '')}</span>
        </div>
      </li>
    );
  }
  const label =
    s.type === 'transfer'
      ? 'Correspondance'
      : s.type === 'waiting'
        ? 'Attente'
        : s.type === 'crow_fly'
          ? 'Rejoindre la gare'
          : STREET_MODE_LABEL[s.mode ?? 'walking'] ?? 'Trajet';
  return (
    <li className="relative flex items-center gap-2 py-1 pl-6 text-xs text-ink-400">
      <span className="absolute top-0 bottom-0 left-[8px] border-l-2 border-dotted border-white/15" />
      {s.type === 'waiting' ? <Hourglass className="size-3.5" /> : s.type === 'transfer' ? <ArrowLeftRight className="size-3.5 text-wait-400" /> : <StreetIcon mode={s.mode} />}
      <span>
        {label} · {formatDuration(s.duration)}
      </span>
    </li>
  );
}

export function JourneyCard({
  j,
  index,
  selected,
  onSelect,
}: {
  j: Journey;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const pts = ptSections(j);
  const delay = journeyDelay(j);
  const co2 = j.co2_emission?.value;
  const tag = JOURNEY_TAG[j.type];

  return (
    <motion.li
      initial={{ opacity: 0, x: index % 2 ? 32 : -32 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={clsx('panel overflow-hidden transition-colors', selected ? 'border-info-500/40 ring-1 ring-info-500/20' : 'hover:border-white/15')}
    >
      <button type="button" className="w-full p-4 text-left" onClick={onSelect} aria-pressed={selected}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-ink-50 tabular">{navitiaTime(j.departure_date_time)}</span>
            <span className="text-ink-500">→</span>
            <span className="font-mono text-2xl font-semibold text-ink-50 tabular">{navitiaTime(j.arrival_date_time)}</span>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-semibold text-info-300 tabular">{formatDuration(j.duration)}</p>
            {tag && <p className="text-[10px] tracking-wider text-ink-500 uppercase">{tag}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {pts.map((s, i) => (
            <span key={s.id} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-600">›</span>}
              <ModeBadge
                commercialMode={s.display_informations?.commercial_mode}
                network={s.display_informations?.network}
                physicalMode={s.display_informations?.physical_mode}
                code={s.display_informations?.trip_short_name || s.display_informations?.code}
                color={s.display_informations?.color}
                textColor={s.display_informations?.text_color}
              />
            </span>
          ))}
          {pts.length === 0 && (
            <Badge>
              <Footprints className="size-3" /> Sans transport en commun
            </Badge>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
          <span className="inline-flex items-center gap-1">
            <TrainFront className="size-3.5" />
            {j.nb_transfers === 0 ? 'Direct' : `${j.nb_transfers} correspondance${j.nb_transfers > 1 ? 's' : ''}`}
          </span>
          {co2 !== undefined && (
            <span className="inline-flex items-center gap-1" title="Émissions estimées par l’API SNCF">
              <Leaf className="size-3.5 text-ok-400" />
              {co2 >= 1000 ? `${(co2 / 1000).toFixed(1).replace('.', ',')} kg` : `${Math.round(co2)} g`} CO₂
            </span>
          )}
          {j.durations?.walking ? (
            <span className="inline-flex items-center gap-1">
              <Footprints className="size-3.5" /> {formatDuration(j.durations.walking)}
            </span>
          ) : null}
          {delay > 0 && <Badge tone="alert">Retard +{delay} min</Badge>}
          {j.status && j.status !== '' && <Badge tone="wait">{j.status.replace(/_/g, ' ').toLowerCase()}</Badge>}
        </div>
      </button>
      <div className="border-t border-white/[0.05]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-4 py-2 text-xs text-ink-400 hover:text-ink-100"
          aria-expanded={open}
        >
          <Clock className="size-3.5" />
          Détail des sections
          <ChevronDown className={clsx('ml-auto size-4 transition-transform', open && 'rotate-180')} />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.ol
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-1 overflow-hidden px-4 pb-4"
            >
              {j.sections.map((s) => (
                <SectionRow key={s.id} s={s} />
              ))}
            </motion.ol>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}
