import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AlertOctagon, Gauge, Inbox, RefreshCw, WifiOff } from 'lucide-react';
import { ApiError } from '@/api/client';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx('space-y-2', className)} role="status" aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-4 grid size-12 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-ink-400">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="text-sm font-semibold text-ink-100">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Affiche une erreur lisible, avec un écran dédié si le quota est atteint. */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const api = error instanceof ApiError ? error : null;

  if (api?.isQuota) {
    return (
      <div className={clsx('panel border-wait-500/25 p-6', className)} role="alert">
        <div className="flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-wait-500/15 text-wait-400">
            <Gauge className="size-5" />
          </div>
          <div>
            <p className="font-semibold text-wait-300">Quota d’appels atteint</p>
            <p className="mt-1 text-sm text-ink-300">
              Le quota gratuit de l’API Navitia est épuisé pour aujourd’hui. Les données déjà en cache restent disponibles ; le
              service reprendra automatiquement au prochain cycle.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isNetwork = api?.code === 'network';
  const title = isNetwork
    ? 'Serveur RailHub injoignable'
    : api?.code === 'upstream_auth'
      ? 'Accès à Navitia refusé'
      : api?.code === 'rate_limited'
        ? 'Trop de requêtes'
        : api?.status === 404
          ? 'Aucun résultat'
          : 'Une erreur est survenue';
  const message =
    api?.message ?? (error instanceof Error ? error.message : 'Erreur inconnue. Réessayez dans quelques instants.');

  return (
    <div className={clsx('panel border-alert-500/20 p-5', className)} role="alert">
      <div className="flex items-start gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-alert-500/12 text-alert-400">
          {isNetwork ? <WifiOff className="size-5" /> : <AlertOctagon className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-100">{title}</p>
          <p className="mt-1 text-sm break-words text-ink-400">{message}</p>
          {api?.details?.length ? (
            <ul className="mt-2 list-inside list-disc text-xs text-ink-500">
              {api.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {onRetry && (
          <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
            Réessayer
          </Button>
        )}
      </div>
    </div>
  );
}
