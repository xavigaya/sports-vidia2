// Selecció de talls de vídeo a partir de les accions codificades
import { applyEvent, initialState, type MatchEvent, type MatchRules, type Side } from '../engine/match';
import type { Evaluation, Skill } from '../engine/actions';

export interface ClipFilter {
  side: Side | null;
  player: number | null; // només té sentit amb un equip
  skills: Skill[]; // buit = tots
  evaluations: Evaluation[]; // buit = totes
  set: number | null;
  pointsOnly: boolean; // només les accions que tanquen la jugada amb punt
}

export const EMPTY_FILTER: ClipFilter = { side: null, player: null, skills: [], evaluations: [], set: null, pointsOnly: false };

export interface Clip {
  seq: number;
  ev: Extract<MatchEvent, { type: 'action' }>;
  set: number;
  scoreH: number; // marcador abans de l'acció
  scoreA: number;
  time: number;
  start: number;
  end: number;
  scored: boolean;
}

// Recorre el partit i retorna les accions amb instant de vídeo que compleixen el filtre
export function buildClips(events: MatchEvent[], rules: MatchRules, filter: ClipFilter, pre: number, post: number): Clip[] {
  let s = initialState(rules);
  const clips: Clip[] = [];
  for (const ev of events) {
    const before = s;
    try {
      s = applyEvent(s, ev);
    } catch {
      continue;
    }
    if (ev.type !== 'action' || ev.videoTime == null) continue;
    const scored = s.score.H + s.score.A > before.score.H + before.score.A;
    if (filter.side && ev.side !== filter.side) continue;
    if (filter.side && filter.player != null && ev.player !== filter.player) continue;
    if (filter.skills.length && !filter.skills.includes(ev.skill)) continue;
    if (filter.evaluations.length && !filter.evaluations.includes(ev.evaluation)) continue;
    if (filter.set != null && s.currentSet !== filter.set) continue;
    if (filter.pointsOnly && !scored) continue;
    clips.push({
      seq: ev.seq,
      ev,
      set: s.currentSet,
      scoreH: before.score.H,
      scoreA: before.score.A,
      time: ev.videoTime,
      start: Math.max(0, ev.videoTime - pre),
      end: ev.videoTime + post,
      scored,
    });
  }
  return clips;
}

// Filtre ↔ paràmetre d'URL (per obrir els vídeos filtrats des de les estadístiques)
export function filterToParam(f: Partial<ClipFilter>): string {
  return JSON.stringify({ ...EMPTY_FILTER, ...f });
}

export function paramToFilter(v: string | null): ClipFilter | null {
  if (!v) return null;
  try {
    const o = JSON.parse(v) as Partial<ClipFilter>;
    return {
      side: o.side === 'H' || o.side === 'A' ? o.side : null,
      player: typeof o.player === 'number' ? o.player : null,
      skills: Array.isArray(o.skills) ? o.skills : [],
      evaluations: Array.isArray(o.evaluations) ? o.evaluations : [],
      set: typeof o.set === 'number' ? o.set : null,
      pointsOnly: !!o.pointsOnly,
    };
  } catch {
    return null;
  }
}
