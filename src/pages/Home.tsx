import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Database,
  Gauge,
  Map as MapIcon,
  MonitorPlay,
  Route as RouteIcon,
  Search,
  TrainFront,
  type LucideIcon,
} from 'lucide-react';
import { LiveDot } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useLiveTrains } from '@/api/hooks/trains';
import { useStatus } from '@/api/hooks/meta';
import { useQuota } from '@/api/hooks/useMeta';
import { sncf } from '@/api/client';
import type { DisruptionsResponse } from '@/types/navitia';
import { parisYmd } from '@/utils/navitiaDate';
import { MODE_META } from '@/utils/modes';

interface Module {
  n: string;
  title: string;
  text: string;
  to: string;
  icon: LucideIcon;
  endpoints: string[];
}

const MODULES: Module[] = [
  { n: '01', title: 'Recherche & géolocalisation', text: 'Autocomplétion des gares, villes et adresses, lignes et réseaux. Gares autour de vous, géocodage inverse d’un clic et fiche gare complète avec codes UIC.', to: '/search', icon: Search, endpoints: ['/places', '/pt_objects', '/places_nearby', '/coords'] },
  { n: '02', title: 'Itinéraires, isochrones & heat map', text: 'Trajets porte-à-porte avec options avancées, CO₂ et tracé par section. Zones atteignables et carte de chaleur des temps de trajet.', to: '/journeys', icon: RouteIcon, endpoints: ['/journeys', '/isochrones', 'heat map serveur'] },
  { n: '03', title: 'Horaires temps réel', text: 'Panneau départs/arrivées façon gare rafraîchi toutes les 30 s, fiches horaires par ligne, grilles arrêts × trains et horaires par terminus.', to: '/board', icon: MonitorPlay, endpoints: ['/departures', '/arrivals', '/stop_schedules', '/route_schedules'] },
  { n: '04', title: 'Trains individuels', text: 'Marche complète d’un train avec heures théoriques et réelles, jours de circulation dans un calendrier, recherche par numéro.', to: '/trips', icon: TrainFront, endpoints: ['/vehicle_journeys', '/trips'] },
  { n: '05', title: 'Carte live', text: 'Tous les TGV, OUIGO et Intercités de France, et les TER/RER au zoom, animés en continu par interpolation entre les gares.', to: '/live', icon: MapIcon, endpoints: ['/vehicle_journeys?since&until', 'agrégation serveur'] },
  { n: '06', title: 'Perturbations & trafic', text: 'Suppressions, retards et motifs en temps réel, état du trafic par réseau, alertes sur vos gares et trains suivis.', to: '/disruptions', icon: AlertTriangle, endpoints: ['/disruptions', '/traffic_reports'] },
  { n: '07', title: 'Référentiel du réseau', text: 'Catalogue paginé des réseaux, lignes, parcours, gares, modes et compagnies, avec navigation d’un objet à ses objets liés.', to: '/catalog/lines', icon: Database, endpoints: ['/networks', '/lines', '/stop_areas', '/routes'] },
  { n: '08', title: 'Statut & technique', text: 'Fraîcheur des données et du temps réel, jeux de données, contributeurs et consommation du quota par le proxy.', to: '/status', icon: Gauge, endpoints: ['/coverage', '/status', '/datasets'] },
];

function useTodayDisruptions() {
  const day = parisYmd();
  return useQuery({
    queryKey: ['home-disruptions', day],
    queryFn: ({ signal }) => sncf<DisruptionsResponse>('disruptions', { since: `${day}T000000`, until: `${day}T235959`, count: 1, depth: 0 }, signal),
    staleTime: 5 * 60_000,
    select: (d) => d.pagination?.total_result ?? 0,
  });
}

/** Rails stylisés animés en arrière-plan du bandeau d'accueil. */
function HeroTracks() {
  const paths = ['M-20 250 C 200 230, 380 120, 620 140 S 980 60, 1220 90', 'M-20 300 C 240 290, 420 200, 700 210 S 1000 150, 1220 170', 'M-20 190 C 180 170, 360 60, 560 70 S 900 10, 1220 20'];
  const colors = [MODE_META.tgv.color, MODE_META.ter.color, MODE_META.intercites.color];
  return (
    <svg viewBox="0 0 1200 320" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full opacity-70" aria-hidden>
      {paths.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="rgb(255 255 255 / 0.05)" strokeWidth="1.5" />
          <motion.path
            d={d}
            fill="none"
            stroke={colors[i]}
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0.06, pathOffset: 0 }}
            animate={{ pathOffset: [0, 1] }}
            transition={{ duration: 9 + i * 3, repeat: Infinity, ease: 'linear', delay: i * 1.5 }}
            style={{ filter: `drop-shadow(0 0 6px ${colors[i]})` }}
          />
        </g>
      ))}
    </svg>
  );
}

function Kpi({ label, value, live }: { label: string; value: React.ReactNode; live?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow flex items-center gap-1.5 text-[10px]">
        {live && <LiveDot />}
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold text-ink-50 tabular md:text-3xl">{value}</p>
    </div>
  );
}

export default function Home() {
  const live = useLiveTrains({ lon: 2.35, lat: 46.6, zoom: 5, radius: 600 });
  const status = useStatus();
  const disruptions = useTodayDisruptions();
  const quota = useQuota();
  const running = live.data?.trains.length;
  const delayed = live.data?.trains.filter((t) => t.dl > 0).length;

  return (
    <div className="space-y-16 pb-10">
      <section className="panel relative overflow-hidden px-6 py-10 md:px-10 md:py-14">
        <HeroTracks />
        <div className="absolute inset-0 bg-gradient-to-r from-night-800 via-night-800/80 to-transparent" />
        <div className="relative max-w-2xl">
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="eyebrow mb-3 flex items-center gap-2">
            <LiveDot /> Supervision du réseau SNCF · API SNCF temps réel
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-3xl leading-tight font-semibold tracking-tight text-ink-50 md:text-5xl"
          >
            Le réseau ferroviaire français, <span className="text-info-300">en direct</span>.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 max-w-xl text-base leading-relaxed text-ink-300">
            Horaires, itinéraires, trains, perturbations et référentiel complet : RailHub exploite l’ensemble de l’API SNCF dans une interface de supervision unique.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-7 flex flex-wrap gap-3">
            <Link to="/live">
              <Button variant="primary" size="lg" icon={<MapIcon className="size-4" />}>
                Ouvrir la carte live
              </Button>
            </Link>
            <Link to="/board">
              <Button size="lg" icon={<MonitorPlay className="size-4" />}>
                Panneau des départs
              </Button>
            </Link>
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="relative mt-10 grid grid-cols-2 gap-6 border-t border-white/[0.07] pt-6 md:grid-cols-4"
        >
          <Kpi live label="Grandes lignes en circulation" value={running?.toLocaleString('fr-FR') ?? '—'} />
          <Kpi label="Dont en retard" value={delayed !== undefined ? <span className={delayed ? 'text-wait-300' : ''}>{delayed}</span> : '—'} />
          <Kpi label="Perturbations du jour" value={disruptions.data?.toLocaleString('fr-FR') ?? '—'} />
          <Kpi
            label="Temps réel"
            value={
              status.data?.status ? (
                <span className={status.data.status.is_realtime_loaded ? 'text-ok-400' : 'text-alert-300'}>{status.data.status.is_realtime_loaded ? 'Actif' : 'Absent'}</span>
              ) : (
                '—'
              )
            }
          />
        </motion.div>
      </section>

      <section>
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Huit modules</p>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-50">Tout ce que permet l’API SNCF</h2>
          </div>
          {quota.data && (
            <p className="hidden text-right text-xs text-ink-500 md:block">
              {quota.data.quota.usedToday.toLocaleString('fr-FR')} appels aujourd’hui
              <br />
              {quota.data.cache.entries} réponses en cache
            </p>
          )}
        </div>
        <div className="space-y-4">
          {MODULES.map((m, i) => (
            <motion.div
              key={m.n}
              initial={{ opacity: 0, x: i % 2 ? 60 : -60 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link to={m.to} className="panel group grid items-center gap-5 p-5 transition-colors hover:border-white/15 md:grid-cols-[72px_1fr_auto] md:p-6">
                <div className="flex items-center gap-4 md:block">
                  <span className="font-mono text-sm text-ink-600">{m.n}</span>
                  <span className="mt-2 grid size-11 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-info-400 transition-colors group-hover:border-info-500/40 group-hover:bg-info-500/10">
                    <m.icon className="size-5" strokeWidth={1.7} />
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-ink-50">{m.title}</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-400">{m.text}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.endpoints.map((e) => (
                      <code key={e} className="rounded border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
                        {e}
                      </code>
                    ))}
                  </div>
                </div>
                <span className="hidden items-center gap-1.5 text-sm font-medium text-ink-400 transition-colors group-hover:text-info-300 md:flex">
                  Ouvrir <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="panel flex flex-col items-start gap-4 p-6 md:flex-row md:items-center"
      >
        <Activity className="size-6 text-info-400" />
        <div className="flex-1">
          <p className="font-semibold text-ink-50">Données officielles, positions estimées</p>
          <p className="mt-1 text-sm text-ink-400">
            Horaires et perturbations proviennent de l’API SNCF (temps réel PIV). L’API ne fournissant pas de GPS, la position des trains sur la carte est estimée par interpolation entre deux gares.
          </p>
        </div>
        <Link to="/status" className="text-sm text-info-300 hover:text-info-400">
          Statut des données →
        </Link>
      </motion.section>
    </div>
  );
}
