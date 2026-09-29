import { config } from './config.js';

const parisDay = () =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );

const state = {
  day: parisDay(),
  used: 0,
  errors: 0,
  lastUpstreamStatus: 0 as number,
  quotaExceededAt: null as string | null,
  /** Informations renvoyées par Navitia si présentes (en-têtes X-RateLimit-*) */
  upstream: {} as Record<string, string>,
};

function rollDay() {
  const today = parisDay();
  if (today !== state.day) {
    state.day = today;
    state.used = 0;
    state.errors = 0;
    state.quotaExceededAt = null;
  }
}

export function recordUpstreamCall(status: number, headers: Headers) {
  rollDay();
  state.used++;
  state.lastUpstreamStatus = status;
  if (status >= 500 || status === 401 || status === 403) state.errors++;
  if (status === 429) state.quotaExceededAt = new Date().toISOString();

  const upstream: Record<string, string> = {};
  headers.forEach((value, name) => {
    if (/^x-rate-?limit|^ratelimit|^x-quota|^retry-after/i.test(name)) upstream[name.toLowerCase()] = value;
  });
  if (Object.keys(upstream).length) state.upstream = upstream;
}

/** Vrai si le compteur local a atteint le quota journalier configuré. */
export function localQuotaReached(): boolean {
  rollDay();
  return state.used >= config.DAILY_QUOTA;
}

export function quotaInfo() {
  rollDay();
  const remainingHeader =
    state.upstream['x-ratelimit-remaining'] ?? state.upstream['ratelimit-remaining'] ?? state.upstream['x-quota-remaining'];
  return {
    day: state.day,
    usedToday: state.used,
    dailyQuota: config.DAILY_QUOTA,
    remainingEstimate: Math.max(0, config.DAILY_QUOTA - state.used),
    upstreamRemaining: remainingHeader !== undefined ? Number(remainingHeader) : null,
    upstreamHeaders: state.upstream,
    upstreamErrors: state.errors,
    lastUpstreamStatus: state.lastUpstreamStatus,
    quotaExceededAt: state.quotaExceededAt,
  };
}
