import { Star } from 'lucide-react';
import clsx from 'clsx';
import { favorites, useIsFavorite, type Favorite } from '@/store/favorites';

export function FavoriteButton({ fav, className }: { fav: Favorite; className?: string }) {
  const active = useIsFavorite(fav.id);
  return (
    <button
      type="button"
      onClick={() => favorites.toggle(fav)}
      aria-pressed={active}
      title={active ? 'Retirer des favoris' : 'Suivre (alertes de perturbation)'}
      className={clsx(
        'inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-all',
        active
          ? 'border-wait-500/40 bg-wait-500/12 text-wait-300'
          : 'border-white/[0.09] bg-white/[0.04] text-ink-300 hover:border-white/15 hover:text-ink-100',
        className,
      )}
    >
      <Star className={clsx('size-4', active && 'fill-current')} />
      {active ? 'Suivi' : 'Suivre'}
    </button>
  );
}
