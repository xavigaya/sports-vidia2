// =====================================================================
// Intèrpret de la línia d'ordres (notació DataVolley)
//
// Es poden escriure diversos codis seguits, separats per espais:
//     S+ 7R# a11A=
//
// Accions de joc:  [equip][dorsal][fonament][tipus][qualificació][zona inici][zona final]
//     *12SH#16    servei del local 12, tipus H, ace, de la zona 1 a la 6
//     a7R+        recepció positiva del visitant 7
//     4A#         sense prefix: equip local (excepte S i R, vegeu sota)
//     S+          servei sense dorsal: el fa qui és a la posició I de l'equip que serveix
//     5R-         recepció sense prefix: equip que rep
//
// Marcador:
//     *p / ap     punt local / visitant
//     *T / aT     temps mort
//     *c3:13      canvi: surt el 3, entra el 13
//     *l10:5      líbero 10 per (o de tornada pel) 5         [extensió pròpia]
//
// "*" = local, "a" = visitant. Majúscules i minúscules indiferents.
// =====================================================================

import type { MatchEventData, MatchState, Side } from './match';
import { onCourt } from './match';
import { other } from './side';
import type { Evaluation, Skill, SkillType } from './actions';
import { actionCode } from './actions';

export type ParseError = 'empty' | 'side' | 'syntax' | 'player_required';

// Acció tal com s'escriu: l'equip i el dorsal poden faltar
export interface PartialAction {
  type: 'partial_action';
  side: Side | null;
  player: number | null;
  skill: Skill;
  skillType: SkillType | null;
  evaluation: Evaluation;
  startZone: number | null;
  endZone: number | null;
}

export type ParsedToken = MatchEventData | PartialAction;

export type ParseResult =
  | { ok: true; events: ParsedToken[] }
  | { ok: false; error: ParseError; token: string };

const PAIR = /^(\d{1,2})[:.](\d{1,2})$/;
const ACTION = /^(\d{1,2})?([SREABDF])([HMQTUFO])?([#+!\-/=])([1-9~])?([1-9~])?$/i;

function parseToken(raw: string): ParsedToken | ParseError {
  let side: Side | null = null;
  let rest = raw;
  if (rest[0] === '*') {
    side = 'H';
    rest = rest.slice(1);
  } else if (/^a[0-9SREABDFPTCL]/i.test(rest) && rest.length > 1) {
    side = 'A';
    rest = rest.slice(1);
  }
  if (!rest) return 'syntax';

  const op = rest[0].toLowerCase();
  const args = rest.slice(1);

  // Marcador (requereix prefix d'equip)
  if (side && op === 'p' && !args) return { type: 'point', side };
  if (side && op === 't' && !args) return { type: 'timeout', side };
  if (side && op === 'c') {
    const m = PAIR.exec(args);
    return m ? { type: 'sub', side, out: Number(m[1]), in: Number(m[2]) } : 'syntax';
  }
  if (side && op === 'l') {
    const m = PAIR.exec(args);
    return m ? { type: 'libero', side, libero: Number(m[1]), player: Number(m[2]) } : 'syntax';
  }

  const a = ACTION.exec(rest);
  if (!a) return side === null && !/^\d/.test(rest) && !/^[SREABDF]/i.test(rest) ? 'side' : 'syntax';
  const skill = a[2].toUpperCase() as Skill;
  const player = a[1] ? Number(a[1]) : null;
  if (player === null && skill !== 'S') return 'player_required';
  const zone = (z: string | undefined) => (z && z !== '~' ? Number(z) : null);
  return {
    type: 'partial_action',
    side,
    player,
    skill,
    skillType: a[3] ? (a[3].toUpperCase() as SkillType) : null,
    evaluation: a[4] as Evaluation,
    startZone: zone(a[5]),
    endZone: zone(a[6]),
  };
}

export function parseCommand(input: string): ParseResult {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: 'empty', token: '' };
  const events: ParsedToken[] = [];
  for (const tk of tokens) {
    const r = parseToken(tk);
    if (typeof r === 'string') return { ok: false, error: r, token: tk };
    events.push(r);
  }
  return { ok: true, events };
}

// Completa una acció amb l'estat del partit: equip i dorsal per defecte
export function resolveAction(state: MatchState, p: PartialAction): MatchEventData {
  let side = p.side;
  if (side === null) {
    if (p.skill === 'S') side = state.serving;
    else if (p.skill === 'R') side = other(state.serving);
    else side = 'H';
  }
  let player = p.player;
  if (player === null) {
    // Només el servei pot anar sense dorsal
    player = state.phase === 'in_play' ? onCourt(state.teams[side])[0] : 0;
  }
  return {
    type: 'action',
    side,
    player,
    skill: p.skill,
    skillType: p.skillType,
    evaluation: p.evaluation,
    startZone: p.startZone,
    endZone: p.endZone,
  };
}

// Representació en codi d'un esdeveniment (per al registre)
export function eventCode(ev: MatchEventData): string {
  const p = (s: Side) => (s === 'H' ? '*' : 'a');
  const n = (x: number) => String(x).padStart(2, '0');
  switch (ev.type) {
    case 'point':
      return `${p(ev.side)}p`;
    case 'timeout':
      return `${p(ev.side)}T`;
    case 'sub':
      return `${p(ev.side)}c${n(ev.out)}:${n(ev.in)}`;
    case 'libero':
      return `${p(ev.side)}l${n(ev.libero)}:${n(ev.player)}`;
    case 'lineup':
      return `*P${ev.home.positions.map(n).join(' ')} / aP${ev.away.positions.map(n).join(' ')}`;
    case 'action':
      return actionCode(ev);
  }
}
