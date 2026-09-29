import { useId, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlaces, usePtObjects } from '@/api/hooks/search';
import type { EmbeddedType } from '@/types/navitia';
import { useClickOutside, useDebounced } from '@/utils/hooks';
import { PlaceIcon, TYPE_LABEL } from './PlaceIcon';

export interface PickedPlace {
  id: string;
  name: string;
  type: EmbeddedType;
  lngLat?: [number, number];
  /** Objet brut (Place ou PtObject) */
  raw?: unknown;
}

interface Props {
  label?: string;
  placeholder?: string;
  value?: PickedPlace | null;
  onChange: (p: PickedPlace | null) => void;
  /** Types pour /places */
  placeTypes?: EmbeddedType[];
  /** Types pour /pt_objects (lignes, réseaux…). Vide = désactivé */
  ptTypes?: EmbeddedType[];
  icon?: ReactNode;
  className?: string;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
}

/** Champ d'autocomplétion (debounce 300 ms) sur /places et /pt_objects. */
export function PlaceAutocomplete({
  label,
  placeholder = 'Gare, ville, adresse…',
  value,
  onChange,
  placeTypes = ['stop_area', 'administrative_region', 'address'],
  ptTypes = [],
  icon,
  className,
  autoFocus,
  size = 'md',
}: Props) {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(text, 300);
  const places = usePlaces(placeTypes.length ? q : '', placeTypes);
  const pts = usePtObjects(ptTypes.length ? q : '', ptTypes);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  const options = useMemo<PickedPlace[]>(() => {
    const out: PickedPlace[] = [];
    for (const p of places.data ?? []) {
      const obj = p.stop_area ?? p.address ?? p.administrative_region ?? p.stop_point;
      const c = obj && 'coord' in obj ? obj.coord : undefined;
      out.push({ id: p.id, name: p.name, type: p.embedded_type, lngLat: c ? [Number(c.lon), Number(c.lat)] : undefined, raw: p });
    }
    for (const p of pts.data ?? []) out.push({ id: p.id, name: p.name, type: p.embedded_type, raw: p });
    return out;
  }, [places.data, pts.data]);

  const loading = (places.isFetching || pts.isFetching) && q.length >= 2;
  const showList = open && text.trim().length >= 2;

  const pick = (p: PickedPlace) => {
    onChange(p);
    setText('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      const opt = options[active];
      if (showList && opt) {
        e.preventDefault();
        pick(opt);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !text && value) {
      onChange(null);
    }
  };

  return (
    <div ref={ref} className={clsx('relative', className)}>
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <div
        className={clsx(
          'group flex items-center gap-2 rounded-lg border border-white/[0.08] bg-night-900/80 px-3 transition-colors',
          'focus-within:border-info-500/60 focus-within:ring-2 focus-within:ring-info-500/20 hover:border-white/15',
          size === 'lg' ? 'h-12' : 'h-10',
        )}
      >
        <span className="shrink-0 text-ink-500">{icon ?? <PlaceIcon type={value?.type ?? 'stop_area'} />}</span>
        {value && !text ? (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm text-ink-100"
            onClick={() => {
              setText(value.name);
              setOpen(true);
            }}
          >
            {value.name}
          </button>
        ) : (
          <input
            id={inputId}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            autoFocus={autoFocus}
            className="h-full min-w-0 flex-1 bg-transparent text-base text-ink-100 outline-none placeholder:text-ink-500 sm:text-sm"
            placeholder={placeholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
        )}
        {loading && <Loader2 className="size-4 shrink-0 animate-spin text-ink-500" />}
        {(value || text) && !loading && (
          <button
            type="button"
            aria-label="Effacer"
            className="grid size-6 shrink-0 place-items-center rounded text-ink-500 hover:bg-white/5 hover:text-ink-200"
            onClick={() => {
              setText('');
              onChange(null);
            }}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showList && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-white/[0.08] bg-night-800/95 p-1.5 shadow-[var(--shadow-pop)] backdrop-blur-xl"
          >
            {options.length === 0 && !loading && <li className="px-3 py-3 text-sm text-ink-500">Aucun résultat pour « {text} »</li>}
            {options.map((o, i) => (
              <li
                key={`${o.type}:${o.id}`}
                role="option"
                aria-selected={i === active}
                onPointerEnter={() => setActive(i)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm',
                  i === active ? 'bg-white/[0.07] text-ink-50' : 'text-ink-300',
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/[0.04] text-ink-400">
                  <PlaceIcon type={o.type} className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                <span className="shrink-0 text-[10px] font-medium tracking-wider text-ink-500 uppercase">{TYPE_LABEL[o.type] ?? o.type}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
