import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, X } from 'lucide-react';
import { useFavorites } from '@/store/favorites';
import { useFavoriteAlerts } from '@/api/hooks/disruptions';

/** Bandeau global : une perturbation touche une gare ou un train suivi. */
export function AlertBanner() {
  const favs = useFavorites();
  const alerts = useFavoriteAlerts(favs);
  const signature = alerts.map((a) => `${a.fav.id}:${a.count}`).join('|');
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('railhub:alert-dismissed');
    } catch {
      return null;
    }
  });

  const visible = alerts.length > 0 && dismissed !== signature;
  const first = alerts[0];

  return (
    <AnimatePresence>
      {visible && first && (
        <motion.div
          role="alert"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="shrink-0 overflow-hidden border-b border-wait-500/25 bg-wait-500/[0.08]"
        >
          <div className="flex items-center gap-3 px-4 py-2 text-sm md:px-6">
            <BellRing className="size-4 shrink-0 text-wait-400" />
            <p className="min-w-0 flex-1 truncate text-wait-300">
              <span className="font-semibold">
                {alerts.length === 1 ? 'Perturbation sur un favori' : `${alerts.length} favoris perturbés`}
              </span>
              <span className="text-ink-300"> · </span>
              {alerts.map((a, i) => (
                <span key={a.fav.id}>
                  {i > 0 && ', '}
                  <Link
                    to={a.fav.kind === 'station' ? `/stop-areas/${encodeURIComponent(a.fav.id)}` : `/train/${encodeURIComponent(a.fav.id)}`}
                    className="text-ink-100 underline decoration-white/20 underline-offset-2 hover:decoration-wait-400"
                  >
                    {a.fav.name}
                  </Link>
                </span>
              ))}
              <span className="hidden text-ink-400 md:inline"> — {first.label}</span>
            </p>
            <button
              className="grid size-7 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-white/5 hover:text-ink-100"
              aria-label="Masquer l’alerte"
              onClick={() => {
                setDismissed(signature);
                try {
                  sessionStorage.setItem('railhub:alert-dismissed', signature);
                } catch {
                  /* ignore */
                }
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
