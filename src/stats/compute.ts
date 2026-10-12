// =====================================================================
// Càlcul d'estadístiques a partir dels esdeveniments d'un partit
//
// Es reprodueix el partit amb el motor (així les accions invàlides no
// compten) i, per a cada acció, s'acumulen els recomptes per jugador i
// per equip. Cada vegada que el marcador canvia es registra la jugada
// (qui servia, qui guanya, rotació de cada equip) per calcular el
// side-out i el break-point.
// =====================================================================

import { EVALUATIONS, SKILLS, type Evaluation, type Skill } from '../engine/actions';
import { applyEvent, initialState, other, type MatchEvent, type MatchRules, type MatchState, type Side } from '../engine/match';

export type EvalCounts = Record<Evaluation, number> & { total: number };
export type SkillCounts = Record<Skill, EvalCounts>;

export function emptyEval(): EvalCounts {
  return { total: 0, '#': 0, '+': 0, '!': 0, '-': 0, '/': 0, '=': 0 };
}
export function emptySkills(): SkillCounts {
  return Object.fromEntries(SKILLS.map((s) => [s, emptyEval()])) as SkillCounts;
}

// Recompte de zones (1..9) d'inici i final per fonament
export type ZoneCounts = Record<Skill, { start: Record<number, EvalCounts>; end: Record<number, EvalCounts> }>;
function emptyZones(): ZoneCounts {
  return Object.fromEntries(SKILLS.map((s) => [s, { start: {}, end: {} }])) as unknown as ZoneCounts;
}

export interface Line {
  skills: SkillCounts;
  zones: ZoneCounts;
}

export interface PointBreakdown {
  serve: number; // aces
  attack: number;
  block: number;
  opponentErrors: number; // errors d'acció del rival
  teamErrors: number; // errors d'equip del rival (*e / ae)
  other: number; // punts sense acció associada (*p / ap)
  total: number;
}

export interface Ratio {
  won: number;
  total: number;
}

export interface TeamStats extends Line {
  points: PointBreakdown;
  sideOut: Ratio; // jugades en recepció guanyades
  breakPoint: Ratio; // jugades en servei guanyades
  rotations: Record<string, { sideOut: Ratio; breakPoint: Ratio }>;
}

export interface Rally {
  set: number;
  serving: Side;
  winner: Side;
  rotation: Record<Side, string>;
  scoreH: number;
  scoreA: number;
}

export interface MatchStats {
  players: Record<Side, Record<number, Line>>;
  teams: Record<Side, TeamStats>;
  rallies: Rally[];
}

export interface StatsOptions {
  set?: number | null; // només un set
  setters?: Record<Side, number[]>; // dorsals dels col·locadors (per anomenar les rotacions)
}

function emptyPoints(): PointBreakdown {
  return { serve: 0, attack: 0, block: 0, opponentErrors: 0, teamErrors: 0, other: 0, total: 0 };
}

function emptyTeam(): TeamStats {
  return {
    skills: emptySkills(),
    zones: emptyZones(),
    points: emptyPoints(),
    sideOut: { won: 0, total: 0 },
    breakPoint: { won: 0, total: 0 },
    rotations: {},
  };
}

function addZone(z: ZoneCounts, skill: Skill, kind: 'start' | 'end', zone: number | null | undefined, ev: Evaluation) {
  if (!zone) return;
  const bucket = (z[skill][kind][zone] ??= emptyEval());
  bucket.total += 1;
  bucket[ev] += 1;
}

function addAction(line: Line, skill: Skill, ev: Evaluation, startZone?: number | null, endZone?: number | null) {
  const c = line.skills[skill];
  c.total += 1;
  c[ev] += 1;
  addZone(line.zones, skill, 'start', startZone, ev);
  addZone(line.zones, skill, 'end', endZone, ev);
}

// Rotació d'un equip: posició del col·locador (P1..P6) o, si no se'n coneix cap,
// el jugador que és a la posició I
export function rotationLabel(state: MatchState, side: Side, setters: number[] | undefined): string {
  const lineup = state.teams[side].lineup;
  const idx = setters ? lineup.findIndex((n) => setters.includes(n)) : -1;
  return idx >= 0 ? `P${idx + 1}` : `I·${lineup[0] ?? '?'}`;
}

export function computeMatchStats(events: MatchEvent[], rules: MatchRules, opts: StatsOptions = {}): MatchStats {
  const result: MatchStats = { players: { H: {}, A: {} }, teams: { H: emptyTeam(), A: emptyTeam() }, rallies: [] };
  const player = (side: Side, n: number): Line => (result.players[side][n] ??= { skills: emptySkills(), zones: emptyZones() });

  let s = initialState(rules);
  for (const ev of [...events].sort((a, b) => a.seq - b.seq)) {
    const before = s;
    try {
      s = applyEvent(s, ev);
    } catch {
      continue;
    }
    const set = ev.type === 'lineup' ? s.currentSet : before.currentSet;
    if (opts.set != null && set !== opts.set) continue;

    if (ev.type === 'action') {
      addAction(player(ev.side, ev.player), ev.skill, ev.evaluation, ev.startZone, ev.endZone);
      addAction(result.teams[ev.side], ev.skill, ev.evaluation, ev.startZone, ev.endZone);
    }

    // Final de jugada: el marcador ha canviat
    const scored = s.score.H + s.score.A !== before.score.H + before.score.A && before.phase === 'in_play';
    if (!scored) continue;
    const winner: Side = s.score.H > before.score.H ? 'H' : 'A';
    const serving = before.serving;
    const rotation = {
      H: rotationLabel(before, 'H', opts.setters?.H),
      A: rotationLabel(before, 'A', opts.setters?.A),
    };
    result.rallies.push({ set, serving, winner, rotation, scoreH: before.score.H, scoreA: before.score.A });

    // Origen del punt
    const pts = result.teams[winner].points;
    pts.total += 1;
    if (ev.type === 'action') {
      if (ev.side === winner) {
        if (ev.skill === 'S') pts.serve += 1;
        else if (ev.skill === 'A') pts.attack += 1;
        else if (ev.skill === 'B') pts.block += 1;
        else pts.other += 1;
      } else pts.opponentErrors += 1;
    } else if (ev.type === 'point' && ev.error) pts.teamErrors += 1;
    else pts.other += 1;

    // Side-out (equip que rep) i break-point (equip que serveix)
    const receiving = other(serving);
    result.teams[receiving].sideOut.total += 1;
    result.teams[serving].breakPoint.total += 1;
    if (winner === receiving) result.teams[receiving].sideOut.won += 1;
    else result.teams[serving].breakPoint.won += 1;
    for (const side of ['H', 'A'] as Side[]) {
      const label = rotation[side];
      const r = (result.teams[side].rotations[label] ??= { sideOut: { won: 0, total: 0 }, breakPoint: { won: 0, total: 0 } });
      const bucket = side === serving ? r.breakPoint : r.sideOut;
      bucket.total += 1;
      if (winner === side) bucket.won += 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------
// Indicadors derivats
// ---------------------------------------------------------------------
export const pct = (n: number, d: number): number | null => (d > 0 ? n / d : null);

export interface Kpis {
  serve: { total: number; aces: number; errors: number; eff: number | null };
  reception: { total: number; pos: number | null; perfect: number | null; errors: number; eff: number | null };
  attack: { total: number; kills: number; errors: number; blocked: number; kill: number | null; eff: number | null };
  block: { points: number; errors: number };
  set: { total: number; pos: number | null; errors: number };
  dig: { total: number; pos: number | null; errors: number };
  freeball: { total: number; pos: number | null; errors: number };
  points: number; // S# + A# + B#
  errors: number; // accions que donen punt al rival
}

export function kpis(sk: SkillCounts): Kpis {
  const S = sk.S, R = sk.R, A = sk.A, B = sk.B, E = sk.E, D = sk.D, F = sk.F;
  const simple = (c: EvalCounts) => ({ total: c.total, pos: pct(c['#'] + c['+'], c.total), errors: c['='] });
  return {
    serve: { total: S.total, aces: S['#'], errors: S['='], eff: pct(S['#'] - S['='], S.total) },
    reception: {
      total: R.total,
      pos: pct(R['#'] + R['+'], R.total),
      perfect: pct(R['#'], R.total),
      errors: R['='],
      eff: pct(R['#'] + R['+'] - R['/'] - R['='], R.total),
    },
    attack: {
      total: A.total,
      kills: A['#'],
      errors: A['='],
      blocked: A['/'],
      kill: pct(A['#'], A.total),
      eff: pct(A['#'] - A['='] - A['/'], A.total),
    },
    block: { points: B['#'], errors: B['='] + B['/'] },
    set: simple(E),
    dig: simple(D),
    freeball: simple(F),
    points: S['#'] + A['#'] + B['#'],
    errors: SKILLS.reduce((n, s) => n + sk[s]['='], 0) + A['/'] + B['/'],
  };
}

// Suma de recomptes (per acumular diversos partits)
export function addSkills(into: SkillCounts, from: SkillCounts) {
  for (const s of SKILLS) {
    into[s].total += from[s].total;
    for (const e of EVALUATIONS) into[s][e] += from[s][e];
  }
}

export function addZones(into: ZoneCounts, from: ZoneCounts) {
  for (const s of SKILLS) {
    for (const kind of ['start', 'end'] as const) {
      for (const [z, c] of Object.entries(from[s][kind])) {
        const t = (into[s][kind][Number(z)] ??= emptyEval());
        t.total += c.total;
        for (const e of EVALUATIONS) t[e] += c[e];
      }
    }
  }
}

export function emptyLine(): Line {
  return { skills: emptySkills(), zones: emptyZones() };
}

export function emptyTeamStats(): TeamStats {
  return emptyTeam();
}

export function addTeam(into: TeamStats, from: TeamStats) {
  addSkills(into.skills, from.skills);
  addZones(into.zones, from.zones);
  for (const k of Object.keys(into.points) as (keyof PointBreakdown)[]) into.points[k] += from.points[k];
  into.sideOut.won += from.sideOut.won;
  into.sideOut.total += from.sideOut.total;
  into.breakPoint.won += from.breakPoint.won;
  into.breakPoint.total += from.breakPoint.total;
  for (const [label, r] of Object.entries(from.rotations)) {
    const t = (into.rotations[label] ??= { sideOut: { won: 0, total: 0 }, breakPoint: { won: 0, total: 0 } });
    t.sideOut.won += r.sideOut.won;
    t.sideOut.total += r.sideOut.total;
    t.breakPoint.won += r.breakPoint.won;
    t.breakPoint.total += r.breakPoint.total;
  }
}
