// Colors dels dos equips d'un partit per a gràfiques: el de l'equip (o el del
// club si és propi) i, si coincideixen o no n'hi ha, un color de contrast.
import type { Side } from '../engine/match';

const FALLBACK = { own: '#0b5cab', rival: '#e07b39' };

function distance(a: string, b: string): number {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export function sideColors(
  home: { color?: string | null; is_own: boolean },
  away: { color?: string | null; is_own: boolean },
  clubPrimary: string,
): Record<Side, string> {
  const valid = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
  const H = valid(home.color) ?? (home.is_own ? valid(clubPrimary) : null) ?? (home.is_own ? FALLBACK.own : FALLBACK.rival);
  let A = valid(away.color) ?? (away.is_own ? valid(clubPrimary) : null) ?? (away.is_own ? FALLBACK.own : FALLBACK.rival);
  if (distance(H, A) < 90) A = distance(H, FALLBACK.rival) < 90 ? FALLBACK.own : FALLBACK.rival;
  return { H, A };
}

// Quin costat és el "nostre equip": l'equip propi; si ho són els dos o cap, el local
export function ownSide(home: { is_own: boolean }, away: { is_own: boolean }): Side {
  return !home.is_own && away.is_own ? 'A' : 'H';
}
