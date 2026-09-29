import { Link } from 'react-router-dom';
import { SignpostBig } from 'lucide-react';
import { EmptyState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <EmptyState
      className="min-h-[60vh]"
      icon={<SignpostBig className="size-5" />}
      title="Voie inconnue"
      description="Cette page n’existe pas ou a été déplacée."
      action={
        <Link to="/">
          <Button variant="primary">Retour à l’accueil</Button>
        </Link>
      }
    />
  );
}
