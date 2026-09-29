import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { useStopArea } from '@/api/hooks/search';
import { MAJOR_STATIONS } from '@/utils/stations';
import { PlaceAutocomplete } from './SearchBox/PlaceAutocomplete';

/** Sélecteur de gare synchronisé avec le paramètre d'URL `stop`. */
export function useStationParam(): [string | undefined, (id: string | undefined) => void] {
  const [params, setParams] = useSearchParams();
  const stop = params.get('stop') ?? undefined;
  const set = (id: string | undefined) => {
    const next = new URLSearchParams(params);
    if (id) next.set('stop', id);
    else next.delete('stop');
    setParams(next);
  };
  return [stop, set];
}

export function StationPicker({ className, withChips = true }: { className?: string; withChips?: boolean }) {
  const [stop, setStop] = useStationParam();
  const sa = useStopArea(stop);
  return (
    <div className={clsx('space-y-3', className)}>
      <PlaceAutocomplete
        size="lg"
        placeholder="Choisir une gare…"
        placeTypes={['stop_area']}
        value={stop ? { id: stop, name: sa.data?.name ?? 'Chargement…', type: 'stop_area' } : null}
        onChange={(p) => setStop(p?.id)}
      />
      {withChips && (
        <div className="flex flex-wrap gap-1.5">
          {MAJOR_STATIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStop(s.id)}
              className={clsx(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                s.id === stop
                  ? 'border-info-500/50 bg-info-500/12 text-info-300'
                  : 'border-white/[0.08] text-ink-400 hover:border-white/15 hover:text-ink-100',
              )}
            >
              {s.short}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
