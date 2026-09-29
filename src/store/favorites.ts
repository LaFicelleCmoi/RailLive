import { useSyncExternalStore } from 'react';

export interface FavoriteStation {
  kind: 'station';
  id: string;
  name: string;
}
export interface FavoriteTrain {
  kind: 'train';
  /** identifiant de vehicle_journey */
  id: string;
  name: string;
  direction?: string;
}
export type Favorite = FavoriteStation | FavoriteTrain;

const KEY = 'railhub:favorites:v1';
const listeners = new Set<() => void>();

function read(): Favorite[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Favorite[]) : [];
    return Array.isArray(parsed) ? parsed.filter((f) => f && typeof f.id === 'string') : [];
  } catch {
    return [];
  }
}

let snapshot: Favorite[] = read();

function write(next: Favorite[]) {
  snapshot = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible : on garde l'état en mémoire */
  }
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      snapshot = read();
      listeners.forEach((l) => l());
    }
  });
}

export const favorites = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => snapshot,
  has: (id: string) => snapshot.some((f) => f.id === id),
  toggle(fav: Favorite) {
    write(favorites.has(fav.id) ? snapshot.filter((f) => f.id !== fav.id) : [...snapshot, fav].slice(-20));
  },
  remove(id: string) {
    write(snapshot.filter((f) => f.id !== id));
  },
};

export function useFavorites(): Favorite[] {
  return useSyncExternalStore(favorites.subscribe, favorites.get, favorites.get);
}

export function useIsFavorite(id: string | undefined): boolean {
  const list = useFavorites();
  return !!id && list.some((f) => f.id === id);
}
