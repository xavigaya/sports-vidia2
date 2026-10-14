// =====================================================================
// Dades dels informes en format Click&Scout / DataVolley
//
//  * Estadístiques generals: recompte de cada valoració per fonament
//    (servei, recepció, atac, bloqueig) amb #% i eficiència (*E%).
//  * Informe del partit (Match Report): parcials, durada dels sets,
//    participació de cada jugador a cada set, punts, break-points,
//    guanyats-perduts i resum per fonament, per jugador, equip i set.
//
// No modifica les estadístiques generals de l'aplicació: és una manera
// diferent de presentar-les (i les fórmules de *E% són les de Click&Scout).
// =====================================================================

import { pointWinner, type Evaluation } from '../engine/actions';
import { applyEvent, initialState, other, targetPoints, type MatchEvent, type MatchRules, type MatchState, type Side } from '../engine/match';
import type { EvalCounts, SkillCounts } from '../stats/compute';

// ---------------------------------------------------------------------
// Estadístiques generals
// ---------------------------------------------------------------------
export type GsSkill = 'S' | 'R' | 'A' | 'B';
export const GS_SKILLS: GsSkill[] = ['S', 'R', 'A', 'B'];
// Ordre de les columnes, de pitjor a millor (com a Click&Scout)
export const GS_EVALS: Evaluation[] = ['=', '/', '-', '!', '+', '#'];

// Fórmules de l'eficiència (*E%) de Click&Scout
export const GS_FORMULAS: Record<GsSkill, string> = {
  S: '(%#)+(%/)+(%+)+(%!)',
  R: '(%#)+(%+)',
  A: '(%#)-(%/)-(%=)',
  B: '(%#)+(%+)-(%/)-(%=)',
};

export function gsPerfect(c: EvalCounts): number | null {
  return c.total > 0 ? c['#'] / c.total : null;
}

export function gsEfficiency(skill: GsSkill, c: EvalCounts): number | null {
  if (c.total === 0) return null;
  const n =
    skill === 'S'
      ? c['#'] + c['/'] + c['+'] + c['!']
      : skill === 'R'
        ? c['#'] + c['+']
        : skill === 'A'
          ? c['#'] - c['/'] - c['=']
          : c['#'] + c['+'] - c['/'] - c['='];
  return n / c.total;
}

// Percentatge sense decimals; buit si és 0 o no es pot calcular (com a Click&Scout)
export function gsPct(v: number | null): string {
  if (v == null) return '';
  const r = Math.round(v * 100);
  return r === 0 ? '' : `${r}%`;
}

export function hasGeneralStats(sk: SkillCounts): boolean {
  return GS_SKILLS.some((s) => sk[s].total > 0);
}

// ---------------------------------------------------------------------
// Informe del partit
// ---------------------------------------------------------------------
export interface ReportLine {
  points: number; // S# + A# + B#
  bp: number; // punts fets amb el servei del seu equip (break-points)
  won: number; // punts guanyats amb accions
  lost: number; // errors que donen punt al rival
  serve: { tot: number; err: number; pts: number };
  reception: { tot: number; err: number; pos: number; exc: number }; // pos = # i +, exc = #
  attack: { tot: number; err: number; blocked: number; pts: number };
  block: { pts: number };
}

export function emptyReportLine(): ReportLine {
  return {
    points: 0,
    bp: 0,
    won: 0,
    lost: 0,
    serve: { tot: 0, err: 0, pts: 0 },
    reception: { tot: 0, err: 0, pos: 0, exc: 0 },
    attack: { tot: 0, err: 0, blocked: 0, pts: 0 },
    block: { pts: 0 },
  };
}

export function addReportLine(into: ReportLine, from: ReportLine) {
  into.points += from.points;
  into.bp += from.bp;
  into.won += from.won;
  into.lost += from.lost;
  for (const k of ['serve', 'reception', 'attack', 'block'] as const) {
    const a = into[k] as unknown as Record<string, number>;
    const b = from[k] as unknown as Record<string, number>;
    for (const f of Object.keys(a)) a[f] += b[f];
  }
}

// Participació en un set: titular (amb la posició inicial I..VI), suplent que entra o líbero
export interface SetParticipation {
  kind: 'start' | 'sub' | 'libero';
  position?: number; // 1..6 per als titulars
  setter?: boolean; // col·locador titular
}

export interface PointsWon {
  serve: number;
  attack: number;
  block: number;
  opponentErrors: number;
}

export interface SetReport {
  number: number;
  home: number;
  away: number;
  winner: Side | null;
  firstServe: Side;
  partials: { h: number; a: number }[]; // marcador quan un equip arriba a 8, 16 i 21 (8 al tie-break)
  duration: number | null; // segons
}

export interface SideReport {
  players: Record<number, { line: ReportLine; sets: Record<number, SetParticipation> }>;
  total: ReportLine;
  perSet: Record<number, ReportLine>;
  pointsWon: Record<number, PointsWon>;
}

export interface MatchReportData {
  sets: SetReport[];
  duration: number | null;
  setsWon: Record<Side, number>;
  sides: Record<Side, SideReport>;
}

export interface ReportOptions {
  setters?: Record<Side, number[]>;
}

function emptySide(): SideReport {
  return { players: {}, total: emptyReportLine(), perSet: {}, pointsWon: {} };
}

function partialMarks(target: number): number[] {
  return target <= 15 ? [8] : [8, 16, 21];
}

const timeOf = (e: MatchEvent): number | null => {
  if (!e.at) return null;
  const t = Date.parse(e.at);
  return Number.isFinite(t) ? t / 1000 : null;
};

// Durada d'un set: per l'hora en què s'han desat els esdeveniments (codificació en
// directe) o, si no és significativa (partits importats), pel temps del vídeo
function setDuration(events: MatchEvent[]): number | null {
  const span = (vals: number[]) => (vals.length >= 2 ? Math.max(...vals) - Math.min(...vals) : 0);
  const real = span(events.map(timeOf).filter((v): v is number => v != null));
  if (real >= 60 && real < 4 * 3600) return real;
  const video = span(events.map((e) => e.videoTime).filter((v): v is number => v != null));
  if (video >= 60 && video < 4 * 3600) return video;
  return null;
}

export function computeMatchReport(events: MatchEvent[], rules: MatchRules, opts: ReportOptions = {}): MatchReportData {
  const sides: Record<Side, SideReport> = { H: emptySide(), A: emptySide() };
  const setEvents = new Map<number, MatchEvent[]>();
  const partials = new Map<number, { h: number; a: number }[]>();

  const playerOf = (side: Side, n: number) => (sides[side].players[n] ??= { line: emptyReportLine(), sets: {} });
  const perSet = (side: Side, set: number) => (sides[side].perSet[set] ??= emptyReportLine());
  const pointsWon = (side: Side, set: number) =>
    (sides[side].pointsWon[set] ??= { serve: 0, attack: 0, block: 0, opponentErrors: 0 });
  const participate = (side: Side, set: number, n: number, p: SetParticipation) => {
    const sets = playerOf(side, n).sets;
    if (!sets[set]) sets[set] = p;
  };

  let s: MatchState = initialState(rules);
  for (const ev of [...events].sort((a, b) => a.seq - b.seq)) {
    const before = s;
    try {
      s = applyEvent(s, ev);
    } catch {
      continue;
    }
    const set = ev.type === 'lineup' ? s.currentSet : before.currentSet;
    if (set > 0) {
      const list = setEvents.get(set) ?? [];
      list.push(ev);
      setEvents.set(set, list);
    }

    if (ev.type === 'lineup') {
      for (const side of ['H', 'A'] as Side[]) {
        const l = side === 'H' ? ev.home : ev.away;
        l.positions.forEach((n, i) =>
          participate(side, set, n, { kind: 'start', position: i + 1, setter: !!opts.setters?.[side]?.includes(n) }),
        );
      }
    } else if (ev.type === 'sub') {
      participate(ev.side, set, ev.in, { kind: 'sub' });
    }
    // Líberos que han entrat al camp
    for (const side of ['H', 'A'] as Side[]) {
      const lib = s.teams[side].libero;
      if (lib && s.currentSet === set) participate(side, set, lib.libero, { kind: 'libero' });
    }

    const scored = s.score.H + s.score.A !== before.score.H + before.score.A && before.phase === 'in_play';
    const winner: Side | null = scored ? (s.score.H > before.score.H ? 'H' : 'A') : null;

    if (ev.type === 'action') {
      const lines = [playerOf(ev.side, ev.player).line, sides[ev.side].total, perSet(ev.side, set)];
      const pw = pointWinner(ev);
      const isPoint = pw === ev.side && ev.evaluation === '#';
      const isBp = winner === ev.side && isPoint && before.serving === ev.side;
      for (const line of lines) {
        if (isPoint) {
          line.points += 1;
          line.won += 1;
        }
        if (isBp) line.bp += 1;
        if (pw === other(ev.side)) line.lost += 1;
        if (ev.skill === 'S') {
          line.serve.tot += 1;
          if (ev.evaluation === '=') line.serve.err += 1;
          if (ev.evaluation === '#') line.serve.pts += 1;
        } else if (ev.skill === 'R') {
          line.reception.tot += 1;
          if (ev.evaluation === '=') line.reception.err += 1;
          if (ev.evaluation === '#' || ev.evaluation === '+') line.reception.pos += 1;
          if (ev.evaluation === '#') line.reception.exc += 1;
        } else if (ev.skill === 'A') {
          line.attack.tot += 1;
          if (ev.evaluation === '=') line.attack.err += 1;
          if (ev.evaluation === '/') line.attack.blocked += 1;
          if (ev.evaluation === '#') line.attack.pts += 1;
        } else if (ev.skill === 'B') {
          if (ev.evaluation === '#') line.block.pts += 1;
        }
      }
    }

    if (!winner) continue;
    // Origen del punt guanyat
    const won = pointsWon(winner, set);
    if (ev.type === 'action' && ev.side === winner) {
      if (ev.skill === 'S') won.serve += 1;
      else if (ev.skill === 'A') won.attack += 1;
      else if (ev.skill === 'B') won.block += 1;
    } else if ((ev.type === 'action' && ev.side !== winner) || (ev.type === 'point' && ev.error)) {
      won.opponentErrors += 1;
    }
    // Parcials (quan el primer equip arriba a 8, 16 i 21)
    const target = targetPoints(before, set);
    const lead = Math.max(s.score.H, s.score.A);
    const prevLead = Math.max(before.score.H, before.score.A);
    for (const mark of partialMarks(target)) {
      if (lead >= mark && prevLead < mark) {
        const list = partials.get(set) ?? [];
        list.push({ h: s.score.H, a: s.score.A });
        partials.set(set, list);
      }
    }
  }

  const sets: SetReport[] = s.sets.map((r) => ({
    number: r.number,
    home: r.home,
    away: r.away,
    winner: r.winner,
    firstServe: r.firstServe,
    partials: partials.get(r.number) ?? [],
    duration: setDuration(setEvents.get(r.number) ?? []),
  }));
  const durations = sets.map((x) => x.duration);
  const duration = durations.length && durations.every((d) => d != null) ? durations.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
  return { sets, duration, setsWon: { ...s.setsWon }, sides };
}

// Format h:mm
export function formatDuration(sec: number | null): string {
  if (sec == null) return '';
  const min = Math.round(sec / 60);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}
