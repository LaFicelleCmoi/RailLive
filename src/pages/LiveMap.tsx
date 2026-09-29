import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FeatureCollection } from 'geojson';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, Loader2, X, ZoomIn } from 'lucide-react';
import { MapView, useMap } from '@/components/map/MapView';
import { GeoJsonLayer } from '@/components/map/layers';
import { TrainsLayer } from '@/components/map/TrainsLayer';
import { SidePanel } from '@/components/ui/SidePanel';
import { FilterChip } from '@/components/ui/Segmented';
import { Badge, LiveDot } from '@/components/ui/Badge';
import { ModeBadge } from '@/components/ui/ModeBadge';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';
import { Timeline, type TimelineItem } from '@/components/Timeline/Timeline';
import { useLiveTrains, type LiveTrain } from '@/api/hooks/trains';
import { LIVE_MODES, MODE_META, type TrainMode } from '@/utils/modes';
import { FRANCE_BOUNDS, FRANCE_CENTER, haversine, type LngLat } from '@/utils/geo';
import { decodePolyline } from '@/utils/polyline';
import { useNow } from '@/utils/hooks';

interface View {
  lon: number;
  lat: number;
  zoom: number;
  radius: number;
}

/** Remonte la vue courante (centre, zoom, rayon en km) après chaque déplacement. */
function ViewTracker({ onChange }: { onChange: (v: View) => void }) {
  const map = useMap();
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (!map) return;
    let t: ReturnType<typeof setTimeout>;
    const emit = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const c = map.getCenter();
        const ne = map.getBounds().getNorthEast();
        cb.current({ lon: c.lng, lat: c.lat, zoom: map.getZoom(), radius: haversine([c.lng, c.lat], [ne.lng, ne.lat]) / 1000 });
      }, 600);
    };
    emit();
    map.on('moveend', emit);
    return () => {
      clearTimeout(t);
      map.off('moveend', emit);
    };
  }, [map]);
  return null;
}

function trainItems(t: LiveTrain): TimelineItem[] {
  return t.s.map(([, , a, d, dl, name], i) => ({
    key: `${i}-${name}`,
    name,
    arr: new Date(a * 1000),
    dep: new Date(d * 1000),
    baseArr: new Date((a - dl * 60) * 1000),
    baseDep: new Date((d - dl * 60) * 1000),
    delay: dl,
  }));
}

function TrainPanel({ t, onClose }: { t: LiveTrain; onClose: () => void }) {
  const now = useNow(1000);
  const items = useMemo(() => trainItems(t), [t]);
  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-night-800/95 p-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <ModeBadge mode={t.m} code={t.n} />
            <p className="mt-2 truncate text-base font-semibold text-ink-50">
              {t.s[0]?.[5]} → {t.h}
            </p>
          </div>
          <button onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-white/5 hover:text-ink-100" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {t.dl > 0 ? <Badge tone={t.dl >= 5 ? 'alert' : 'wait'}>Retard +{t.dl} min</Badge> : <Badge tone="ok">À l’heure</Badge>}
          <Badge>
            <Info className="size-3" /> Position estimée
          </Badge>
        </div>
        {t.msg && <p className="mt-2 text-xs text-wait-300">{t.msg}</p>}
      </div>
      <div className="p-4">
        <Timeline items={items} now={now} color={MODE_META[t.m].color} compact />
        <Link to={`/train/${encodeURIComponent(t.id)}`}>
          <Button variant="primary" className="mt-2 w-full">
            Fiche complète du train
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function LiveMapPage() {
  const [view, setView] = useState<View | null>(null);
  const live = useLiveTrains(view);
  const [modes, setModes] = useState<Set<TrainMode>>(new Set(LIVE_MODES));
  const [selected, setSelected] = useState<string | null>(null);
  const [visible, setVisible] = useState(0);

  const all = live.data?.trains ?? [];
  const trains = useMemo(() => all.filter((t) => modes.has(t.m)), [all, modes]);
  const counts = useMemo(() => {
    const c: Partial<Record<TrainMode, number>> = {};
    for (const t of all) c[t.m] = (c[t.m] ?? 0) + 1;
    return c;
  }, [all]);
  const delayed = trains.filter((t) => t.dl > 0).length;
  const sel = selected ? all.find((t) => t.id === selected) ?? null : null;

  // Réseau : tracé réel des circulations chargées (rails du RFN, ligne droite là où il n'est pas couvert)
  const segments = live.data?.segments;
  const decoded = useRef(new Map<string, LngLat[]>());
  const networkFC = useMemo<FeatureCollection>(() => {
    const cache = decoded.current;
    const geometryOf = (t: LiveTrain): LngLat[] => {
      const out: LngLat[] = [];
      t.s.forEach(([lon, lat], i) => {
        if (i === t.s.length - 1) {
          out.push([lon, lat]);
          return;
        }
        const idx = t.p?.[i];
        const enc = idx !== undefined && idx >= 0 ? segments?.[idx] : undefined;
        if (!enc) {
          out.push([lon, lat]);
          return;
        }
        if (!cache.has(enc)) cache.set(enc, decodePolyline(enc));
        out.push(...cache.get(enc)!.slice(0, -1));
      });
      return out;
    };
    return {
      type: 'FeatureCollection',
      features: trains.map((t) => ({
        type: 'Feature',
        properties: { c: MODE_META[t.m].color, sel: t.id === selected ? 1 : 0 },
        geometry: { type: 'LineString', coordinates: geometryOf(t) },
      })),
    };
  }, [trains, selected, segments]);

  const updated = live.data ? new Date(live.data.generatedAt * 1000).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' }) : null;

  return (
    <div className="relative h-full">
      <MapView className="absolute inset-0" center={FRANCE_CENTER} bounds={FRANCE_BOUNDS} controlsPosition="bottom-left">
        <ViewTracker onChange={setView} />
        <GeoJsonLayer
          id="live-network"
          data={networkFC}
          layers={[
            {
              id: 'live-network-line',
              type: 'line',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': ['get', 'c'],
                'line-width': ['case', ['==', ['get', 'sel'], 1], 3, ['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 1.4]],
                // Les voies deviennent plus lisibles en zoomant : on voit les trains les suivre
                'line-opacity': ['case', ['==', ['get', 'sel'], 1], 0.95, ['interpolate', ['linear'], ['zoom'], 5, 0.16, 9, 0.35, 12, 0.5]],
              },
            },
          ]}
        />
        <TrainsLayer trains={trains} segments={segments} selected={selected} onSelect={setSelected} onFrame={setVisible} />
      </MapView>

      {/* Barre de contrôle */}
      <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-col gap-2 sm:inset-x-3 sm:top-3 md:inset-x-4 md:top-4">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel pointer-events-auto flex max-w-full flex-col gap-2 self-stretch bg-night-800/85 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:self-start sm:px-4 sm:py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow hidden text-[10px] sm:block">Module 5 · Carte live</p>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-50">
                <LiveDot /> {visible.toLocaleString('fr-FR')} trains
                {delayed > 0 && <span className="text-xs font-medium text-alert-300">· {delayed} en retard</span>}
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-[11px] text-ink-500 sm:hidden">
              {live.isFetching && <Loader2 className="size-3.5 animate-spin" />}
              {updated}
            </span>
          </div>
          <div className="scroll-x -mx-1 gap-1.5 px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {LIVE_MODES.map((m) => (
              <FilterChip
                key={m}
                color={MODE_META[m].color}
                active={modes.has(m)}
                onClick={() =>
                  setModes((cur) => {
                    const n = new Set(cur);
                    if (n.has(m)) n.delete(m);
                    else n.add(m);
                    return n;
                  })
                }
              >
                {MODE_META[m].short}
                {counts[m] ? <span className="font-mono text-[10px] text-ink-500">{counts[m]}</span> : null}
              </FilterChip>
            ))}
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-ink-500 sm:flex">
            {live.isFetching ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {updated && <span>Données {updated}</span>}
          </div>
        </motion.div>

        <div className="pointer-events-auto flex flex-wrap gap-1.5 self-start sm:gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-wait-500/30 bg-night-900/85 px-2.5 py-1 text-[11px] font-medium text-wait-300 backdrop-blur sm:px-3"
            title="L’API SNCF ne fournit pas de position GPS : chaque train est placé le long des voies d’après les horaires temps réel."
          >
            <Info className="size-3.5 shrink-0" />
            <span className="sm:hidden">Positions estimées</span>
            <span className="hidden sm:inline">Positions estimées à partir des horaires, pas de GPS</span>
          </span>
          {view && view.zoom < 8 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-night-900/85 px-2.5 py-1 text-[11px] text-ink-400 backdrop-blur sm:px-3">
              <ZoomIn className="size-3.5 shrink-0" />
              <span className="sm:hidden">Zoomez : TER / RER</span>
              <span className="hidden sm:inline">Zoomez pour afficher TER et RER / Transilien</span>
            </span>
          )}
        </div>
        {live.isError && (
          <div className="pointer-events-auto max-w-md">
            <ErrorState error={live.error} onRetry={() => live.refetch()} />
          </div>
        )}
      </div>

      {/* Légende retard */}
      <div className="panel absolute right-4 bottom-8 z-10 hidden items-center gap-3 bg-night-800/85 px-3 py-2 text-[11px] text-ink-400 md:flex">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-[1.5px] border-wait-400" /> 1–4 min
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-[1.5px] border-alert-400" /> ≥ 5 min
        </span>
      </div>

      <AnimatePresence>
        {sel && (
          <SidePanel side="right" width={360} key={sel.id}>
            <TrainPanel t={sel} onClose={() => setSelected(null)} />
          </SidePanel>
        )}
      </AnimatePresence>
    </div>
  );
}
