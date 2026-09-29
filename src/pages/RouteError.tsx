import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} · ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Erreur inattendue';
  const chunkError = error instanceof Error && /dynamically imported module|Failed to fetch/i.test(error.message);

  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="panel max-w-md p-8 text-center">
        <p className="eyebrow mb-3">Incident</p>
        <h1 className="text-xl font-semibold text-ink-50">
          {chunkError ? 'Une nouvelle version est disponible' : 'La page n’a pas pu s’afficher'}
        </h1>
        <p className="mt-2 text-sm text-ink-400">{chunkError ? 'Rechargez la page pour continuer.' : message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Recharger
          </Button>
          <Link to="/">
            <Button variant="ghost">Accueil</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
