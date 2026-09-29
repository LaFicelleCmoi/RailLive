import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useMatches, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { NAV } from './nav';
import { QuotaIndicator } from './QuotaIndicator';
import { MobileTabBar } from './MobileTabBar';
import { LiveDot } from '../ui/Badge';

export interface RouteHandle {
  /** Page plein écran (carte) : pas de marge ni de scroll du conteneur */
  fullBleed?: boolean;
}

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5 px-2">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#0e1524" stroke="rgb(255 255 255 / 0.08)" />
        <path d="M7 20.5h18M7 11.5h18" stroke="#2a3549" strokeWidth="2" strokeLinecap="round" />
        <path d="M9 20.5c3-9 11-9 14 0" fill="none" stroke="#4fd3ea" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="23" cy="20.5" r="2.6" fill="#e9edf3" />
      </svg>
      <div className="leading-none">
        <p className="text-[15px] font-semibold tracking-tight text-ink-50">RailHub</p>
        <p className="mt-1 text-[10px] font-medium tracking-[0.16em] text-ink-500 uppercase">Réseau SNCF</p>
      </div>
    </NavLink>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Navigation principale">
      {NAV.map((group) => (
        <div key={group.title}>
          <p className="eyebrow mb-2 px-2 text-[10px]">{group.title}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                      isActive
                        ? 'bg-white/[0.06] text-ink-50'
                        : 'text-ink-400 hover:bg-white/[0.03] hover:text-ink-100',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-info-400"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        />
                      )}
                      <item.icon
                        className={clsx('size-4 shrink-0', isActive ? 'text-info-400' : 'text-ink-500 group-hover:text-ink-300')}
                        strokeWidth={1.8}
                      />
                      <span className="truncate">{item.label}</span>
                      {item.badge === 'live' && <LiveDot className="ml-auto" />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ topbar, banner }: { topbar?: ReactNode; banner?: ReactNode }) {
  const location = useLocation();
  const outlet = useOutlet();
  const matches = useMatches();
  const fullBleed = matches.some((m) => (m.handle as RouteHandle | undefined)?.fullBleed);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [location.pathname]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/[0.06] bg-night-850/80 backdrop-blur-xl lg:flex">
        <div className="flex h-16 items-center px-3">
          <Brand />
        </div>
        <SidebarNav />
        <div className="border-t border-white/[0.06] p-3">
          <QuotaIndicator />
          <p className="mt-2 px-2 text-[10px] leading-snug text-ink-600">
            Données API SNCF. Positions des trains estimées.
          </p>
        </div>
      </aside>

      {/* Drawer mobile */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,86vw)] flex-col border-r border-white/[0.08] bg-night-850 lg:hidden"
              style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            >
              <div className="flex h-16 items-center justify-between px-3">
                <Brand />
                <button
                  className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-white/5"
                  onClick={() => setDrawer(false)}
                  aria-label="Fermer le menu"
                >
                  <X className="size-5" />
                </button>
              </div>
              <SidebarNav onNavigate={() => setDrawer(false)} />
              <div className="border-t border-white/[0.06] p-3">
                <QuotaIndicator />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="relative z-30 flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] bg-night-900/70 px-3 backdrop-blur-xl sm:gap-3 md:px-5"
          style={{ paddingTop: 'env(safe-area-inset-top)', minHeight: 'calc(3.5rem + env(safe-area-inset-top))' }}
        >
          {/* Mobile / tablette : logo compact ; le menu complet s'ouvre via « Plus » dans la barre du bas */}
          <NavLink to="/" className="shrink-0 lg:hidden" aria-label="Accueil RailHub">
            <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
              <rect width="32" height="32" rx="8" fill="#0e1524" stroke="rgb(255 255 255 / 0.08)" />
              <path d="M9 20.5c3-9 11-9 14 0" fill="none" stroke="#4fd3ea" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="23" cy="20.5" r="2.6" fill="#e9edf3" />
            </svg>
          </NavLink>
          <div className="min-w-0 flex-1">{topbar}</div>
          <div className="hidden sm:block lg:hidden">
            <QuotaIndicator compact />
          </div>
        </header>
        {banner}
        <main
          id="main"
          className={clsx('relative min-h-0 flex-1', fullBleed ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden')}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={clsx(fullBleed ? 'h-full' : 'mx-auto w-full max-w-[1400px] px-3.5 py-5 sm:px-5 md:px-8 md:py-8')}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
        <MobileTabBar onMenu={() => setDrawer(true)} />
      </div>
    </div>
  );
}
