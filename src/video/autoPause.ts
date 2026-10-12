// Pausa automàtica del vídeo mentre s'escriuen codis
export interface AutoPause {
  enabled: boolean;
  delay: number; // segons sense escriure abans de reprendre
}

const KEY = 'svidia.autoPause';
export const DEFAULT_AUTO_PAUSE: AutoPause = { enabled: true, delay: 1 };

export function readAutoPause(): AutoPause {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '');
    if (typeof v.enabled === 'boolean' && typeof v.delay === 'number') return { enabled: v.enabled, delay: clampDelay(v.delay) };
  } catch {
    /* valors per defecte */
  }
  return DEFAULT_AUTO_PAUSE;
}

export function writeAutoPause(v: AutoPause) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* sense emmagatzematge */
  }
}

export function clampDelay(d: number): number {
  if (!Number.isFinite(d)) return DEFAULT_AUTO_PAUSE.delay;
  return Math.min(10, Math.max(0.3, Math.round(d * 10) / 10));
}
