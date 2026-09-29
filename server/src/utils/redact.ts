import { SECRETS } from '../config.js';

/** Remplace toute occurrence d'un secret connu par « *** ». */
export function redact(input: unknown): string {
  let text = typeof input === 'string' ? input : input instanceof Error ? `${input.name}: ${input.message}` : safeJson(input);
  for (const secret of SECRETS) {
    if (secret) text = text.split(secret).join('***');
  }
  // Ceinture et bretelles : en-têtes Authorization éventuels
  return text.replace(/(authorization["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1***');
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const log = {
  info: (...parts: unknown[]) => console.log(`[railhub] ${parts.map(redact).join(' ')}`),
  warn: (...parts: unknown[]) => console.warn(`[railhub] ${parts.map(redact).join(' ')}`),
  error: (...parts: unknown[]) => console.error(`[railhub] ${parts.map(redact).join(' ')}`),
};
