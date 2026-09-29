import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { Disruption, DisruptionEffect } from '@/types/navitia';
import { Badge, type Tone } from './Badge';
import { formatDateTime, parseNavitiaDate } from '@/utils/navitiaDate';

export const EFFECT_META: Record<DisruptionEffect, { label: string; tone: Tone }> = {
  NO_SERVICE: { label: 'Supprimé', tone: 'alert' },
  REDUCED_SERVICE: { label: 'Service réduit', tone: 'alert' },
  SIGNIFICANT_DELAYS: { label: 'Retard', tone: 'wait' },
  DETOUR: { label: 'Détour', tone: 'wait' },
  MODIFIED_SERVICE: { label: 'Modifié', tone: 'wait' },
  STOP_MOVED: { label: 'Arrêt déplacé', tone: 'wait' },
  ADDITIONAL_SERVICE: { label: 'Train ajouté', tone: 'info' },
  OTHER_EFFECT: { label: 'Information', tone: 'neutral' },
  UNKNOWN_EFFECT: { label: 'Information', tone: 'neutral' },
};

export function effectMeta(effect: string | undefined) {
  return EFFECT_META[(effect ?? 'UNKNOWN_EFFECT') as DisruptionEffect] ?? EFFECT_META.UNKNOWN_EFFECT;
}

/** Motif lisible : l'API SNCF laisse souvent `cause` vide et met le motif dans les messages ou les arrêts. */
export function disruptionReason(d: Disruption): string {
  const stopCause = d.impacted_objects?.flatMap((o) => o.impacted_stops ?? []).find((s) => s.cause)?.cause;
  return d.cause || d.messages?.[0]?.text || stopCause || 'Motif non communiqué';
}

/** Objet impacté principal : numéro de train, ligne ou gare. */
export function disruptionTarget(d: Disruption): { label: string; href?: string } | null {
  const obj = d.impacted_objects?.[0]?.pt_object;
  if (!obj) return null;
  if (obj.embedded_type === ('trip' as string) || obj.trip) {
    const name = obj.trip?.name ?? obj.name;
    return { label: `Train ${name}`, href: `/train/${encodeURIComponent(`vehicle_journey:${obj.id}`)}` };
  }
  if (obj.embedded_type === 'line') return { label: `Ligne ${obj.name}`, href: `/lines/${encodeURIComponent(obj.id)}` };
  if (obj.embedded_type === 'stop_area') return { label: obj.name, href: `/stop-areas/${encodeURIComponent(obj.id)}` };
  return { label: obj.name };
}

/** Retard maximal (min) observé sur les arrêts impactés. */
export function maxDelay(d: Disruption): number {
  let max = 0;
  for (const o of d.impacted_objects ?? []) {
    for (const s of o.impacted_stops ?? []) {
      const pairs: [string | undefined, string | undefined][] = [
        [s.base_arrival_time, s.amended_arrival_time],
        [s.base_departure_time, s.amended_departure_time],
      ];
      for (const [b, a] of pairs) {
        if (!b || !a) continue;
        let diff = (toSec(a) - toSec(b)) / 60;
        if (diff < -720) diff += 1440;
        max = Math.max(max, Math.round(diff));
      }
    }
  }
  return max;
}
const toSec = (hms: string) => +hms.slice(0, 2) * 3600 + +hms.slice(2, 4) * 60 + +hms.slice(4, 6);

export function DisruptionItem({ d, compact }: { d: Disruption; compact?: boolean }) {
  const meta = effectMeta(d.severity?.effect);
  const target = disruptionTarget(d);
  const delay = maxDelay(d);
  const period = d.application_periods?.[0];
  return (
    <div className={clsx('flex gap-3', compact ? 'py-2' : 'py-3')}>
      <span
        className={clsx(
          'mt-1.5 size-2 shrink-0 rounded-full',
          meta.tone === 'alert' ? 'bg-alert-400' : meta.tone === 'wait' ? 'bg-wait-400' : 'bg-info-400',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {delay > 0 && <Badge tone="wait">+{delay} min</Badge>}
          {target &&
            (target.href ? (
              <Link to={target.href} className="text-sm font-medium text-ink-100 hover:text-info-300">
                {target.label}
              </Link>
            ) : (
              <span className="text-sm font-medium text-ink-100">{target.label}</span>
            ))}
        </div>
        <p className="mt-1 text-sm text-ink-300">{disruptionReason(d)}</p>
        {!compact && period && (
          <p className="mt-1 font-mono text-[11px] text-ink-500">
            {formatDateTime(parseNavitiaDate(period.begin))} → {formatDateTime(parseNavitiaDate(period.end))}
          </p>
        )}
      </div>
    </div>
  );
}
