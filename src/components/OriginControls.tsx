import { useSearchParams } from 'react-router-dom';
import { CircleDot } from 'lucide-react';
import { PlaceAutocomplete } from './SearchBox/PlaceAutocomplete';
import { useStopArea } from '@/api/hooks/search';
import { fromDateTimeLocal, toDateTimeLocal, toNavitiaDate } from '@/utils/navitiaDate';

/** Gare d'origine + date (paramètres d'URL `from` et `dt`), partagé par Isochrones et Heat map. */
export function useOrigin() {
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? undefined;
  const dtLocal = params.get('dt') ?? toDateTimeLocal(new Date());
  const date = fromDateTimeLocal(dtLocal) ?? new Date();
  // Arrondi au quart d'heure : meilleure réutilisation du cache serveur
  const rounded = new Date(Math.floor(date.getTime() / 900_000) * 900_000);
  const set = (patch: Record<string, string | undefined>) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    setParams(n, { replace: true });
  };
  return { from, dtLocal, datetime: toNavitiaDate(rounded), set, params };
}

export function OriginControls() {
  const { from, dtLocal, set } = useOrigin();
  const sa = useStopArea(from);
  return (
    <div className="grid gap-3">
      <PlaceAutocomplete
        label="Gare de départ"
        placeTypes={['stop_area']}
        icon={<CircleDot className="size-4 text-info-400" />}
        value={from ? { id: from, name: sa.data?.name ?? 'Chargement…', type: 'stop_area' } : null}
        onChange={(p) => set({ from: p?.id })}
      />
      <div>
        <label className="label" htmlFor="origin-dt">
          Départ le
        </label>
        <input id="origin-dt" type="datetime-local" className="input" value={dtLocal} onChange={(e) => set({ dt: e.target.value })} />
      </div>
    </div>
  );
}
