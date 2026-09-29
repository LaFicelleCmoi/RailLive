import type { Disruption, ImpactedStop, VehicleJourney } from '@/types/navitia';
import { hmsToSeconds, parisDate, parisYmd } from './navitiaDate';
import { toLngLat } from './geo';

export interface TimelineStop {
  id: string;
  name: string;
  stopAreaId?: string;
  lon?: number;
  lat?: number;
  baseArr: Date;
  baseDep: Date;
  arr: Date;
  dep: Date;
  delay: number;
  deleted: boolean;
  added: boolean;
  cause?: string;
}

export interface TrainTimeline {
  stops: TimelineStop[];
  cancelled: boolean;
  disruptions: Disruption[];
  serviceDate: string;
}

function wrap(sec: number, ref: number) {
  if (sec < ref - 43_200) return sec + 86_400;
  if (sec > ref + 43_200) return sec - 86_400;
  return sec;
}

/** Date de circulation encodée dans l'identifiant (…:2026-09-29:6603:…). */
export function serviceDateOf(vjId: string): { y: number; m: number; d: number } {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(vjId);
  if (m) return { y: +m[1]!, m: +m[2]!, d: +m[3]! };
  const ymd = parisYmd();
  return { y: +ymd.slice(0, 4), m: +ymd.slice(4, 6), d: +ymd.slice(6, 8) };
}

/** Construit la marche d'un train (théorique + temps réel) à partir d'une circulation et de ses perturbations. */
export function buildTimeline(vj: VehicleJourney, allDisruptions: Disruption[] = []): TrainTimeline {
  const { y, m, d } = serviceDateOf(vj.id);
  const midnight = parisDate(y, m, d).getTime();
  const linked = new Set((vj.disruptions ?? []).map((l) => l.id));
  const tripId = vj.trip?.id;
  const disruptions = allDisruptions.filter(
    (x) => linked.has(x.id) || x.impacted_objects?.some((o) => o.pt_object?.id === tripId || o.pt_object?.trip?.id === tripId),
  );
  const cancelled = disruptions.some((x) => x.severity?.effect === 'NO_SERVICE');

  const impacted = new Map<string, ImpactedStop>();
  for (const dis of disruptions) for (const o of dis.impacted_objects ?? []) for (const s of o.impacted_stops ?? []) impacted.set(s.stop_point.id, s);

  const stops: TimelineStop[] = [];
  let prev = -Infinity;
  for (const st of vj.stop_times) {
    let a = hmsToSeconds(st.arrival_time) ?? 0;
    let dd = hmsToSeconds(st.departure_time) ?? a;
    if (prev !== -Infinity) {
      a = wrap(a, prev);
      dd = wrap(dd, a);
    }
    if (dd < a) dd = a;
    prev = dd;
    const imp = impacted.get(st.stop_point.id);
    const ra = hmsToSeconds(imp?.amended_arrival_time);
    const rd = hmsToSeconds(imp?.amended_departure_time);
    const ba = hmsToSeconds(imp?.base_arrival_time);
    const bd = hmsToSeconds(imp?.base_departure_time);
    const shiftA = ra !== null && ba !== null ? ra - ba : 0;
    const shiftD = rd !== null && bd !== null ? rd - bd : shiftA;
    const ll = toLngLat(st.stop_point.coord);
    stops.push({
      id: st.stop_point.id,
      name: st.stop_point.name,
      stopAreaId: st.stop_point.stop_area?.id,
      lon: ll?.[0],
      lat: ll?.[1],
      baseArr: new Date(midnight + a * 1000),
      baseDep: new Date(midnight + dd * 1000),
      arr: new Date(midnight + (a + shiftA) * 1000),
      dep: new Date(midnight + (dd + shiftD) * 1000),
      delay: Math.round(Math.max(shiftA, shiftD) / 60),
      deleted: imp?.arrival_status === 'deleted' && imp?.departure_status === 'deleted',
      added: imp?.arrival_status === 'added' || imp?.departure_status === 'added',
      cause: imp?.cause || undefined,
    });
  }
  return { stops, cancelled, disruptions, serviceDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

export type TrainStatus = 'not_started' | 'running' | 'arrived' | 'cancelled';

export function trainStatus(tl: TrainTimeline, now: Date): TrainStatus {
  if (tl.cancelled) return 'cancelled';
  const first = tl.stops.find((s) => !s.deleted);
  const last = [...tl.stops].reverse().find((s) => !s.deleted);
  if (!first || !last) return 'cancelled';
  if (now < first.dep) return 'not_started';
  if (now > last.arr) return 'arrived';
  return 'running';
}
