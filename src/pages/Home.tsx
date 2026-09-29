import { PageHeader } from '@/components/ui/PageHeader';
import { QuotaIndicator } from '@/components/layout/QuotaIndicator';

/** Page d'accueil provisoire (la version finale arrive à l'étape « finitions »). */
export default function Home() {
  return (
    <>
      <PageHeader
        eyebrow="RailHub"
        title="Supervision du réseau SNCF"
        description="Socle en place : proxy sécurisé, couche API typée et design system. Les modules arrivent étape par étape."
      />
      <div className="panel flex items-center justify-between p-5">
        <div>
          <p className="text-sm font-medium text-ink-100">Connexion au proxy</p>
          <p className="text-xs text-ink-500">Compteur d’appels Navitia du jour</p>
        </div>
        <QuotaIndicator />
      </div>
    </>
  );
}
