import { Building2, GitBranch, MapPin, Network, TrainFront, Tag } from 'lucide-react';
import type { EmbeddedType } from '@/types/navitia';

export function PlaceIcon({ type, className = 'size-4' }: { type: EmbeddedType; className?: string }) {
  switch (type) {
    case 'stop_area':
    case 'stop_point':
      return <TrainFront className={className} />;
    case 'administrative_region':
      return <Building2 className={className} />;
    case 'address':
      return <MapPin className={className} />;
    case 'line':
    case 'route':
      return <GitBranch className={className} />;
    case 'network':
      return <Network className={className} />;
    default:
      return <Tag className={className} />;
  }
}

export const TYPE_LABEL: Partial<Record<EmbeddedType, string>> = {
  stop_area: 'Gare',
  stop_point: 'Point d’arrêt',
  administrative_region: 'Ville',
  address: 'Adresse',
  line: 'Ligne',
  route: 'Parcours',
  network: 'Réseau',
  commercial_mode: 'Mode',
};
