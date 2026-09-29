import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PlaceAutocomplete, type PickedPlace } from './PlaceAutocomplete';
import { useMediaQuery } from '@/utils/hooks';

/** Barre de recherche globale : gares, villes, adresses, lignes et réseaux. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const narrow = useMediaQuery('(max-width: 639px)');

  const go = (p: PickedPlace | null) => {
    if (!p) return;
    const id = encodeURIComponent(p.id);
    switch (p.type) {
      case 'stop_area':
        return navigate(`/stop-areas/${id}`);
      case 'line':
        return navigate(`/lines/${id}`);
      case 'network':
        return navigate(`/networks/${id}`);
      case 'route':
        return navigate(`/route-schedules?route=${id}`);
      default:
        if (p.lngLat) return navigate(`/search?lon=${p.lngLat[0]}&lat=${p.lngLat[1]}&label=${encodeURIComponent(p.name)}`);
    }
  };

  return (
    <PlaceAutocomplete
      className="max-w-xl"
      value={null}
      onChange={go}
      placeholder={narrow ? 'Gare, ville, ligne…' : 'Rechercher une gare, une ville, une adresse, une ligne…'}
      placeTypes={['stop_area', 'administrative_region', 'address']}
      ptTypes={['line', 'network']}
      icon={<Search className="size-4" />}
    />
  );
}
