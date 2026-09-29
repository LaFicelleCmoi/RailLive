import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowUpDown, Accessibility, CircleDot, MapPin, Route as RouteIcon, Search, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlaceAutocomplete, type PickedPlace } from '@/components/SearchBox/PlaceAutocomplete';
import { Button } from '@/components/ui/Button';
import { Segmented, FilterChip } from '@/components/ui/Segmented';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { LiveDot } from '@/components/ui/Badge';
import { MAP_FONT, MapView } from '@/components/map/MapView';
import { FitBounds, GeoJsonLayer } from '@/components/map/layers';
import { JourneyCard } from '@/components/JourneyCard/JourneyCard';
import { journeyFC, journeyPoints, journeyStopsFC, ptStopsOf } from '@/components/JourneyCard/journeyUtils';
import { useJourneys } from '@/api/hooks/journeys';
import { useRailPath } from '@/api/hooks/trains';
import type { LngLat } from '@/utils/geo';
import { FORBIDDABLE } from '@/utils/modes';
import { fromDateTimeLocal, toDateTimeLocal, toNavitiaDate } from '@/utils/navitiaDate';
import type { Params } from '@/api/client';
import type { EmbeddedType } from '@/types/navitia';

const STREET_MODES = [
  { value: 'walking', label: 'Marche' },
  { value: 'bike', label: 'Vélo' },
  { value: 'car', label: 'Voiture' },
];

function typeFromId(id: string): EmbeddedType {
  if (id.startsWith('stop_area')) return 'stop_area';
  if (id.startsWith('admin')) return 'administrative_region';
  if (id.startsWith('stop_point')) return 'stop_point';
  return 'address';
}

export default function JourneysPage() {
  const [params, setParams] = useSearchParams();
  const get = (k: string, d = '') => params.get(k) ?? d;

  // État du formulaire (initialisé depuis l'URL, partageable)
  const [from, setFrom] = useState<PickedPlace | null>(params.get('from') ? { id: get('from'), name: get('fromName', get('from')), type: typeFromId(get('from')) } : null);
  const [to, setTo] = useState<PickedPlace | null>(params.get('to') ? { id: get('to'), name: get('toName', get('to')), type: typeFromId(get('to')) } : null);
  const [dt, setDt] = useState(get('dt', toDateTimeLocal(new Date())));
  const [rep, setRep] = useState<'departure' | 'arrival'>(get('rep') === 'arrival' ? 'arrival' : 'departure');
  const [transfers, setTransfers] = useState(get('transfers', ''));
  const [wheelchair, setWheelchair] = useState(get('wheelchair') === '1');
  const [forbid, setForbid] = useState<string[]>(get('forbid') ? get('forbid').split(',') : []);
  const [first, setFirst] = useState(get('first', 'walking'));
  const [last, setLast] = useState(get('last', 'walking'));
  const [count, setCount] = useState(Number(get('count', '5')));
  const [fresh, setFresh] = useState<'realtime' | 'base_schedule'>(get('fresh') === 'base_schedule' ? 'base_schedule' : 'realtime');
  const [schedules, setSchedules] = useState(get('sched') === '1');
  const [advanced, setAdvanced] = useState(false);
  const [selected, setSelected] = useState(0);

  // Requête dérivée de l'URL uniquement (le formulaire ne déclenche l'appel qu'à la validation)
  const query = useMemo<Params | null>(() => {
    if (!params.get('from') || !params.get('to')) return null;
    const date = fromDateTimeLocal(get('dt', toDateTimeLocal(new Date()))) ?? new Date();
    return {
      from: get('from'),
      to: get('to'),
      datetime: toNavitiaDate(date),
      datetime_represents: get('rep', 'departure'),
      max_nb_transfers: get('transfers') || undefined,
      wheelchair: get('wheelchair') === '1' ? 'true' : undefined,
      'forbidden_uris[]': get('forbid') ? get('forbid').split(',') : undefined,
      'first_section_mode[]': [get('first', 'walking')],
      'last_section_mode[]': [get('last', 'walking')],
      min_nb_journeys: Number(get('count', '5')),
      data_freshness: get('fresh', 'realtime'),
      is_journey_schedules: get('sched') === '1' ? 'true' : undefined,
      depth: 1,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const q = useJourneys(query);
  const journeys = q.data?.journeys ?? [];
  const current = journeys[Math.min(selected, journeys.length - 1)];

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!from || !to) return;
    const n = new URLSearchParams({
      from: from.id,
      fromName: from.name,
      to: to.id,
      toName: to.name,
      dt,
      rep,
      first,
      last,
      count: String(count),
      fresh,
    });
    if (transfers) n.set('transfers', transfers);
    if (wheelchair) n.set('wheelchair', '1');
    if (forbid.length) n.set('forbid', forbid.join(','));
    if (schedules) n.set('sched', '1');
    setSelected(0);
    setParams(n);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  // Sections en train : tracé sur les rails entre les arrêts desservis
  const pt = useMemo(() => ptStopsOf(current), [current]);
  const rail = useRailPath(pt.points.length > 1 ? pt.points : null);
  const overrides = useMemo(() => {
    const m = new Map<string, LngLat[]>();
    if (!rail.data) return m;
    for (const [id, [a, b]] of pt.ranges) m.set(id, rail.data.slice(a, b).flatMap((seg, i) => (i === 0 ? seg : seg.slice(1))));
    return m;
  }, [rail.data, pt]);
  const allFC = useMemo(() => journeyFC(current, true, overrides), [current, overrides]);
  const stopsFC = useMemo(() => journeyStopsFC(current), [current]);
  const points = useMemo(() => journeyPoints(current), [current]);

  return (
    <>
      <PageHeader
        eyebrow="Module 2 · Itinéraires"
        title="Calculer un itinéraire"
        description="Trajets porte-à-porte sur le réseau SNCF : horaires temps réel, correspondances, émissions de CO₂ et tracé de chaque section."
        endpoint="/journeys"
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 space-y-5">
          <form onSubmit={submit} className="panel space-y-4 p-4">
            <div className="relative grid gap-3">
              <PlaceAutocomplete label="Départ" value={from} onChange={setFrom} icon={<CircleDot className="size-4 text-info-400" />} />
              <PlaceAutocomplete label="Arrivée" value={to} onChange={setTo} icon={<MapPin className="size-4 text-wait-400" />} />
              <button
                type="button"
                onClick={swap}
                aria-label="Inverser départ et arrivée"
                className="absolute top-[52px] right-12 z-10 grid size-8 place-items-center rounded-full border border-white/10 bg-night-700 text-ink-300 hover:text-ink-50"
              >
                <ArrowUpDown className="size-3.5" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              <Segmented
                value={rep}
                onChange={setRep}
                size="sm"
                label="Type d’horaire"
                options={[
                  { value: 'departure', label: 'Partir à' },
                  { value: 'arrival', label: 'Arriver avant' },
                ]}
              />
              <input type="datetime-local" className="input h-9" value={dt} onChange={(e) => setDt(e.target.value)} aria-label="Date et heure" />
            </div>

            <button type="button" onClick={() => setAdvanced((a) => !a)} className="flex items-center gap-2 text-xs font-medium text-ink-400 hover:text-ink-100" aria-expanded={advanced}>
              <SlidersHorizontal className="size-3.5" /> Options avancées
              {(forbid.length > 0 || wheelchair || transfers) && <span className="size-1.5 rounded-full bg-info-400" />}
            </button>

            {advanced && (
              <div className="space-y-4 rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label" htmlFor="transfers">
                      Correspondances max.
                    </label>
                    <select id="transfers" className="input h-9" value={transfers} onChange={(e) => setTransfers(e.target.value)}>
                      <option value="">Illimité</option>
                      {[0, 1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {n === 0 ? 'Direct uniquement' : n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="count">
                      Nombre de trajets
                    </label>
                    <select id="count" className="input h-9" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                      {[3, 5, 8, 10].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="label">Données</span>
                    <Segmented
                      size="sm"
                      value={fresh}
                      onChange={setFresh}
                      options={[
                        { value: 'realtime', label: <><LiveDot /> Réel</> },
                        { value: 'base_schedule', label: 'Théorique' },
                      ]}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="label">Premier tronçon</span>
                    <Segmented size="sm" value={first} onChange={setFirst} options={STREET_MODES} />
                  </div>
                  <div>
                    <span className="label">Dernier tronçon</span>
                    <Segmented size="sm" value={last} onChange={setLast} options={STREET_MODES} />
                  </div>
                </div>
                <div>
                  <span className="label">Exclure</span>
                  <div className="flex flex-wrap gap-1.5">
                    {FORBIDDABLE.map((f) => (
                      <FilterChip key={f.id} active={forbid.includes(f.id)} onClick={() => setForbid((cur) => (cur.includes(f.id) ? cur.filter((x) => x !== f.id) : [...cur, f.id]))}>
                        {forbid.includes(f.id) ? '✕ ' : ''}
                        {f.label}
                      </FilterChip>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-300">
                    <input type="checkbox" className="accent-info-500" checked={wheelchair} onChange={(e) => setWheelchair(e.target.checked)} />
                    <Accessibility className="size-4" /> Accessible fauteuil roulant
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-300" title="Grille horaire origine → destination (is_journey_schedules)">
                    <input type="checkbox" className="accent-info-500" checked={schedules} onChange={(e) => setSchedules(e.target.checked)} />
                    Mode grille horaire
                  </label>
                </div>
              </div>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={!from || !to} loading={q.isFetching} icon={<Search className="size-4" />}>
              Rechercher
            </Button>
          </form>

          {!query && (
            <div className="panel">
              <EmptyState icon={<RouteIcon className="size-5" />} title="Où allez-vous ?" description="Saisissez une gare, une ville ou une adresse de départ et d’arrivée." />
            </div>
          )}
          {q.isLoading && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-36 w-full" />
              ))}
            </div>
          )}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
          {q.isSuccess && journeys.length === 0 && (
            <div className="panel">
              <EmptyState title="Aucun trajet trouvé" description="Modifiez l’heure, retirez des exclusions ou autorisez plus de correspondances." />
            </div>
          )}
          {journeys.length > 0 && (
            <ol className={clsx('space-y-3', q.isFetching && 'opacity-60 transition-opacity')}>
              {journeys.map((j, i) => (
                <JourneyCard key={`${j.departure_date_time}-${j.arrival_date_time}-${i}`} j={j} index={i} selected={i === selected} onSelect={() => setSelected(i)} />
              ))}
            </ol>
          )}
        </div>

        {/* Mobile : la carte passe au-dessus des résultats pour voir le trajet sélectionné sans défiler */}
        <div className={clsx('xl:sticky xl:top-0 xl:self-start', journeys.length > 0 ? 'order-first xl:order-none' : 'hidden xl:block')}>
          <div className="panel h-56 overflow-hidden p-0 sm:h-[360px] xl:h-[calc(100dvh-10rem)]">
            <MapView className="h-full">
              <GeoJsonLayer
                id="journey"
                data={allFC}
                layers={[
                  {
                    id: 'journey-casing',
                    type: 'line',
                    filter: ['==', ['get', 'kind'], 'pt'],
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                    paint: { 'line-color': '#05080f', 'line-width': 7 },
                  },
                  {
                    id: 'journey-pt',
                    type: 'line',
                    filter: ['==', ['get', 'kind'], 'pt'],
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                    paint: { 'line-color': ['get', 'color'], 'line-width': 4 },
                  },
                  {
                    id: 'journey-street',
                    type: 'line',
                    filter: ['!=', ['get', 'kind'], 'pt'],
                    layout: { 'line-cap': 'round' },
                    paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [0.5, 2] },
                  },
                ]}
              />
              <GeoJsonLayer
                id="journey-stops"
                data={stopsFC}
                layers={[
                  {
                    id: 'journey-stops-dot',
                    type: 'circle',
                    paint: {
                      'circle-radius': ['case', ['==', ['get', 'terminal'], 1], 6, 3],
                      'circle-color': '#0e1524',
                      'circle-stroke-color': ['get', 'color'],
                      'circle-stroke-width': 2,
                    },
                  },
                  {
                    id: 'journey-stops-label',
                    type: 'symbol',
                    filter: ['==', ['get', 'terminal'], 1],
                    layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-font': MAP_FONT },
                    paint: { 'text-color': '#e9edf3', 'text-halo-color': '#05080f', 'text-halo-width': 1.5 },
                  },
                ]}
              />
              <FitBounds points={points} padding={50} maxZoom={13} />
            </MapView>
          </div>
        </div>
      </div>
    </>
  );
}
