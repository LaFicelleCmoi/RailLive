import { Activity, Database, Gauge, Radio, Server, Users } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, DefinitionList, Stat } from '@/components/ui/Card';
import { Badge, LiveDot } from '@/components/ui/Badge';
import { ErrorState, SkeletonRows } from '@/components/ui/States';
import { useContributors, useCoverageList, useDatasets, useStatus } from '@/api/hooks/meta';
import { useQuota } from '@/api/hooks/useMeta';
import { formatDateTime, parseNavitiaDate } from '@/utils/navitiaDate';

/** Accepte YYYYMMDD, YYYYMMDDTHHMMSS et YYYYMMDDTHHMMSS.micro */
function parseLoose(v?: string | null): Date | null {
  if (!v) return null;
  if (/^\d{8}$/.test(v)) return parseNavitiaDate(`${v}T000000`);
  return parseNavitiaDate(v.split('.')[0]!);
}
/** Horodatages techniques du statut (chargements, flux temps réel) : exprimés en UTC par l'API. */
function parseUtc(v?: string | null): Date | null {
  const m = v ? /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(v) : null;
  return m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)) : null;
}
const shortDay = (v?: string) => (v && /^\d{8}/.test(v) ? `${v.slice(6, 8)}/${v.slice(4, 6)}` : '—');
const fmtDay = (v?: string) => parseLoose(v)?.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) ?? '—';

function ago(d: Date | null): string {
  if (!d) return '—';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 90) return `il y a ${s} s`;
  if (s < 5400) return `il y a ${Math.round(s / 60)} min`;
  if (s < 172_800) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86_400)} j`;
}

const bool = (v?: boolean) => (v === undefined ? '—' : v ? <Badge tone="ok">Oui</Badge> : <Badge tone="alert">Non</Badge>);

const TTL_ROWS: [string, string][] = [
  ['Départs, arrivées, perturbations, trafic', '30 s'],
  ['Horaires (stop / route / terminus schedules)', '30 s'],
  ['Itinéraires', '2 min'],
  ['Carte live (agrégation serveur)', '4 min, créneaux de 5 min'],
  ['Isochrones, gares proches, géocodage inverse', '10 min'],
  ['Heat map (agrégation serveur)', '30 min'],
  ['Autocomplétion', '1 h'],
  ['Référentiel (lignes, gares, réseaux…)', '24 h'],
];

export default function StatusPage() {
  const status = useStatus();
  const coverage = useCoverageList();
  const datasets = useDatasets();
  const contributors = useContributors();
  const quota = useQuota();

  const s = status.data?.status;
  const rtDate = parseUtc(s?.last_rt_data_loaded);
  const rtFresh = rtDate ? Date.now() - rtDate.getTime() < 15 * 60_000 : false;
  const q = quota.data?.quota;
  const c = quota.data?.cache;
  const ratio = q ? Math.min(1, q.usedToday / q.dailyQuota) : 0;
  const hitRate = c && c.hits + c.misses ? c.hits / (c.hits + c.misses) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Module 8 · Méta & technique"
        title="Statut des données"
        description="Fraîcheur des données de l’API SNCF, jeux de données, contributeurs, et consommation du quota par le proxy RailHub."
        endpoint={['/coverage', '/coverage/sncf/status', '/datasets', '/contributors', '/api/meta/quota']}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Moteur" value={s?.status ?? '…'} tone={s?.status === 'running' ? 'ok' : s ? 'alert' : undefined} hint={s?.kraken_version ? `Kraken ${s.kraken_version}` : undefined} />
        <Stat
          label="Temps réel"
          value={
            s ? (
              <span className="inline-flex items-center gap-2">
                {s.is_realtime_loaded && <LiveDot tone={rtFresh ? 'ok' : 'alert'} />}
                {s.is_realtime_loaded ? 'Chargé' : 'Absent'}
              </span>
            ) : (
              '…'
            )
          }
          tone={s?.is_realtime_loaded ? (rtFresh ? 'ok' : 'wait') : s ? 'alert' : undefined}
          hint={rtDate ? `Dernière mise à jour ${ago(rtDate)}` : undefined}
        />
        <Stat
          label="Données valides"
          value={s ? `${shortDay(s.start_production_date)} → ${shortDay(s.end_production_date)}` : '…'}
          hint={s ? `jusqu’au ${fmtDay(s.end_production_date)}` : 'période de production'}
        />
        <Stat label="Dernier chargement" value={s ? ago(parseUtc(s.last_load_at)) : '…'} hint={s?.last_load_at ? formatDateTime(parseUtc(s.last_load_at)) : undefined} />
      </div>

      {status.isError && <ErrorState error={status.error} onRetry={() => status.refetch()} className="mb-5" />}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><Server className="size-4 text-info-400" /> Proxy RailHub · quota & cache</span>} eyebrow="/api/meta/quota (rafraîchi toutes les 30 s)">
          {!q || !c ? (
            <SkeletonRows rows={4} />
          ) : (
            <>
              <div className="mb-2 flex items-end justify-between">
                <p className="font-mono text-3xl font-semibold text-ink-50 tabular">
                  {(q.upstreamRemaining ?? q.remainingEstimate).toLocaleString('fr-FR')}
                  <span className="ml-2 text-sm font-normal text-ink-500">appels restants</span>
                </p>
                <span className="font-mono text-xs text-ink-400">
                  {q.usedToday} / {q.dailyQuota}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={q.usedToday} aria-valuemax={q.dailyQuota}>
                <div className={clsx('h-full rounded-full transition-all', ratio > 0.9 ? 'bg-alert-400' : ratio > 0.7 ? 'bg-wait-400' : 'bg-info-400')} style={{ width: `${ratio * 100}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-ink-500">
                {q.upstreamRemaining !== null
                  ? 'Valeur fournie par les en-têtes de l’API.'
                  : 'L’API SNCF ne renvoie pas de compteur de quota : estimation d’après les appels comptés par le proxy depuis minuit (heure de Paris).'}
              </p>
              <div className="mt-5">
                <DefinitionList
                  items={[
                    ['Entrées en cache', c.entries.toLocaleString('fr-FR')],
                    ['Taille du cache', `${(c.sizeBytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`],
                    ['Taux de réponses depuis le cache', `${Math.round(hitRate * 100)} %`],
                    ['Requêtes fusionnées (en vol)', c.coalesced.toLocaleString('fr-FR')],
                    ['Erreurs amont du jour', q.upstreamErrors],
                    ['Dernier code amont', q.lastUpstreamStatus || '—'],
                    ['Quota dépassé', q.quotaExceededAt ? formatDateTime(new Date(q.quotaExceededAt)) : 'Non'],
                  ]}
                />
              </div>
            </>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><Activity className="size-4 text-info-400" /> Couverture « sncf »</span>} eyebrow="/coverage/sncf/status">
          {status.isLoading ? (
            <SkeletonRows rows={6} />
          ) : (
            s && (
              <DefinitionList
                items={[
                  ['Nom', s.name ?? coverage.data?.[0]?.name ?? 'sncf'],
                  ['Version des données', s.data_version ?? '—'],
                  ['Publication', formatDateTime(parseUtc(s.publication_date))],
                  ['Jeu de données créé le', formatDateTime(parseUtc(s.dataset_created_at))],
                  ['Données ouvertes', bool(s.is_open_data)],
                  ['Service ouvert', bool(s.is_open_service)],
                  ['Contributeurs temps réel', s.realtime_contributors?.join(', ') || '—'],
                  ['Dernier flux temps réel', rtDate ? `${formatDateTime(rtDate)} (${ago(rtDate)})` : '—'],
                ]}
              />
            )
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><Database className="size-4 text-info-400" /> Jeux de données</span>} eyebrow="/datasets">
          {datasets.isLoading && <SkeletonRows rows={2} />}
          <ul className="space-y-3">
            {datasets.data?.map((d) => (
              <li key={d.id} className="rounded-lg bg-white/[0.03] p-3">
                <p className="font-mono text-xs text-ink-200">{d.id}</p>
                {d.description && <p className="mt-1 text-sm text-ink-300">{d.description}</p>}
                <p className="mt-1 text-xs text-ink-500">
                  Valide du {fmtDay(d.start_validation_date)} au {fmtDay(d.end_validation_date)}
                  {d.realtime_level && ` · temps réel : ${d.realtime_level}`}
                  {d.system && ` · format ${d.system}`}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Users className="size-4 text-info-400" /> Contributeurs & couvertures</span>} eyebrow="/contributors · /coverage">
          {contributors.isLoading && <SkeletonRows rows={2} />}
          <ul className="space-y-2">
            {contributors.data?.map((c2) => (
              <li key={c2.id} className="flex items-center gap-3 text-sm">
                <Radio className="size-4 text-ink-500" />
                <span className="text-ink-100">{c2.name}</span>
                <span className="font-mono text-xs text-ink-500">{c2.id}</span>
                {c2.license && <Badge className="ml-auto">{c2.license}</Badge>}
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-white/[0.05] pt-4">
            {coverage.data?.map((r) => (
              <p key={r.id} className="flex items-center gap-2 text-sm text-ink-300">
                <Badge tone={r.status === 'running' ? 'ok' : 'wait'}>{r.status}</Badge>
                {r.name ?? r.id} <span className="font-mono text-xs text-ink-500">({r.id})</span>
              </p>
            ))}
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Gauge className="size-4 text-info-400" /> Couche API & mise en cache</span>} className="lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-ink-400">Durées de cache côté proxy</p>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-white/[0.05]">
                  {TTL_ROWS.map(([k, v]) => (
                    <tr key={k}>
                      <td className="py-1.5 text-ink-300">{k}</td>
                      <td className="py-1.5 text-right font-mono text-ink-100">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 text-sm text-ink-300">
              <p className="text-xs font-medium text-ink-400">Paramètres communs supportés</p>
              <ul className="space-y-1.5">
                <li><code className="font-mono text-info-300">depth</code> : niveau de détail des objets (0 à 3)</li>
                <li><code className="font-mono text-info-300">disable_geojson</code> : activé par défaut sur les listes</li>
                <li><code className="font-mono text-info-300">filter</code> : filtres PT-Ref (ex. <code className="font-mono text-xs">commercial_mode.id=… or …</code>)</li>
                <li><code className="font-mono text-info-300">count</code> / <code className="font-mono text-info-300">start_page</code> : pagination (200 max.)</li>
              </ul>
              <p className="pt-2 text-xs text-ink-500">
                Le proxy n’accepte que des chemins et paramètres en liste blanche ; la clé API reste côté serveur et n’apparaît jamais dans le navigateur.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
