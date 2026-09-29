import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Home, Map as MapIcon, Menu, MonitorPlay, Route as RouteIcon } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/live', label: 'Carte', icon: MapIcon },
  { to: '/board', label: 'Départs', icon: MonitorPlay },
  { to: '/journeys', label: 'Trajet', icon: RouteIcon },
];

/** Barre d'onglets en bas d'écran (mobile / tablette) : accès au pouce aux vues principales. */
export function MobileTabBar({ onMenu }: { onMenu: () => void }) {
  return (
    <nav
      aria-label="Navigation rapide"
      className="relative z-30 grid shrink-0 grid-cols-5 border-t border-white/[0.07] bg-night-900/90 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            clsx(
              'relative flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
              isActive ? 'text-info-300' : 'text-ink-500 active:text-ink-200',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-info-400" />}
              <t.icon className="size-5" strokeWidth={isActive ? 2 : 1.7} />
              {t.label}
            </>
          )}
        </NavLink>
      ))}
      <button type="button" onClick={onMenu} className="flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium text-ink-500 active:text-ink-200">
        <Menu className="size-5" strokeWidth={1.7} />
        Plus
      </button>
    </nav>
  );
}
