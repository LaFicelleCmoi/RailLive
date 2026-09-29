import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowRight, Ban, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { ModeBadge } from '@/components/ui/ModeBadge';
import { useCatalogList, useCatalogSearch, isSearchable, type CatalogItem, type CatalogType } from '@/api/hooks/catalog';
import { useDebounced } from '@/utils/hooks';
import { cleanName } from '@/components/DeparturesBoard/DeparturesBoard';

const TYPES: { type: CatalogType; label: string }[] = [
  { type: 'lines', label: 'Lignes' },
  { type: 'networks', label: 'Réseaux' },
  { type: 'stop_areas', label: 'Zones d’arrêt' },
  { type: 'stop_points', label: 'Points d’arrêt' },
  { type: 'routes', label: 'Parcours' },
  { type: 'commercial_modes', label: 'Modes commerciaux' },
  { type: 'physical_modes', label: 'Modes physiques' },
  { type: 'companies', label: 'Compagnies' },
];
const UNAVAILABLE = ['POI', 'Types de POI'];
const PER_PAGE = 25;

/** Lien de détail selon le type d'objet */
function hrefFor(type: CatalogType, it: CatalogItem): string {
  const id = encodeURIComponent(it.id);
  switch (type) {
    case 'lines':
      return `/lines/${id}`;
    case 'stop_areas':
      return `/stop-areas/${id}`;
    case 'stop_points': {
      const sa = (it.raw.stop_area as { id?: string } | undefined)?.id;
      return sa ? `/stop-areas/${encodeURIComponent(sa)}` : `/catalog/stop_points`;
    }
    case 'routes':
      return `/route-schedules?route=${id}`;
    default:
      return `/catalog/${type}/${id}`;
  }
}

function Row({ type, it, i }: { type: CatalogType; it: CatalogItem; i: number }) {
  const r = it.raw;
  let meta: React.ReactNode = null;
  let badge: React.ReactNode = null;
  if (type === 'lines') {
    const cm = (r.commercial_mode as { name?: string } | undefined)?.name;
    const net = (r.network as { name?: string } | undefined)?.name;
    badge = (
      <ModeBadge
        commercialMode={cm}
        network={net}
        code={(r.code as string | undefined) || undefined}
        color={r.color as string | undefined}
        textColor={r.text_color as string | undefined}
      />
    );
    meta = net;
  } else if (type === 'routes') {
    meta = `→ ${cleanName((r.direction as { name?: string } | undefined)?.name ?? '')}`;
  } else if (type === 'stop_points' || type === 'stop_areas') {
    const city = (r.administrative_regions as { name?: string }[] | undefined)?.[0]?.name;
    meta = city;
  } else if (type === 'physical_modes') {
    const co2 = r.co2_emission_rate as { value?: number; unit?: string } | undefined;
    meta = co2?.value !== undefined ? `CO₂ : ${co2.value} ${co2.unit ?? ''}` : null;
  }
  return (
    <motion.li initial={{ opacity: 0, x: i % 2 ? 14 : -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.015, 0.3) }}>
      <Link to={hrefFor(type, it)} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
        {badge}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink-100">{it.name}</span>
          <span className="block truncate font-mono text-[10px] text-ink-600">{it.id}</span>
        </span>
        {meta && <span className="hidden max-w-60 truncate text-xs text-ink-500 sm:block">{meta}</span>}
        <ArrowRight className="size-4 shrink-0 text-ink-600 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-300" />
      </Link>
    </motion.li>
  );
}

export default function CatalogPage() {
  const { type: rawType = 'lines' } = useParams();
  const type = (TYPES.some((t) => t.type === rawType) ? rawType : 'lines') as CatalogType;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 0);
  const network = params.get('network') ?? '';
  const [text, setText] = useState(params.get('q') ?? '');
  const q = useDebounced(text, 300);

  useEffect(() => setText(params.get('q') ?? ''), [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const scope = type === 'lines' && network ? `networks/${network}` : undefined;
  const list = useCatalogList(type, page, PER_PAGE, scope);
  const search = useCatalogSearch(type, q);
  const networks = useCatalogList('networks', 0, 50);
  const searching = q.trim().length >= 2 && isSearchable(type);
  const localFilter = q.trim().length >= 1 && !isSearchable(type);

  const items = searching
    ? (search.data ?? [])
    : (list.data?.items ?? []).filter((it) => !localFilter || it.name.toLowerCase().includes(q.trim().toLowerCase()));
  const loading = searching ? search.isLoading : list.isLoading;
  const error = searching ? search.error : list.error;

  const set = (patch: Record<string, string | undefined>) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    setParams(n);
  };

  return (
    <>
      <PageHeader
        eyebrow="Module 7 · Référentiel"
        title="Catalogue du réseau"
        description="Tout le référentiel de l’API SNCF, paginé : réseaux, lignes, parcours, gares, modes et compagnies. Cliquez sur un objet pour naviguer vers ses objets liés."
        endpoint={[`/${type}?count=&start_page=`, isSearchable(type) ? '/pt_objects · /places' : 'filtre local']}
      />

      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {TYPES.map((t) => (
          <NavLink
            key={t.type}
            to={`/catalog/${t.type}`}
            className={({ isActive }) =>
              clsx(
                'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                isActive ? 'bg-white/[0.08] text-ink-50 ring-1 ring-white/10' : 'text-ink-400 hover:text-ink-100',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
        {UNAVAILABLE.map((l) => (
          <span key={l} className="inline-flex shrink-0 cursor-not-allowed items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-ink-600" title="Non disponible sur l’API SNCF (404 unknown_object)">
            <Ban className="size-3.5" /> {l}
          </span>
        ))}
      </div>

      <div className="panel mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
          <input
            className="input h-9 pl-9"
            placeholder={`Rechercher dans ${TYPES.find((t) => t.type === type)?.label.toLowerCase()}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {type === 'lines' && (
          <select className="input h-9 sm:w-64" value={network} onChange={(e) => set({ network: e.target.value || undefined, page: undefined })} aria-label="Filtrer par réseau">
            <option value="">Tous les réseaux</option>
            {networks.data?.items.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        )}
        <span className="shrink-0 font-mono text-xs text-ink-500">
          {searching ? `${items.length} résultat(s)` : `${(list.data?.total ?? 0).toLocaleString('fr-FR')} objets${list.data?.total === 1000 ? ' (plafond API)' : ''}`}
        </span>
      </div>

      <div className="panel p-2">
        {loading && <SkeletonRows rows={10} className="p-2" />}
        {error && <ErrorState error={error} />}
        {!loading && !error && items.length === 0 && <EmptyState title="Aucun résultat" />}
        <ul className={clsx((list.isFetching || search.isFetching) && 'opacity-70 transition-opacity')}>
          {items.map((it, i) => (
            <Row key={it.id} type={type} it={it} i={i} />
          ))}
        </ul>
        {!searching && list.data && (
          <div className="px-3 pb-2">
            <Pagination page={page} total={list.data.total} perPage={PER_PAGE} onChange={(p) => set({ page: p ? String(p) : undefined })} />
          </div>
        )}
      </div>
      {type === 'lines' && !network && (
        <p className="mt-3 text-xs text-ink-500">
          L’API SNCF plafonne la liste des lignes à 1 000 résultats : filtrez par réseau pour tout parcourir.{' '}
          <button className="text-info-300 hover:text-info-400" onClick={() => navigate('/catalog/networks')}>
            Voir les réseaux →
          </button>
        </p>
      )}
    </>
  );
}
