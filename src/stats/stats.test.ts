import { describe, expect, test } from 'vitest';
import { computeMatchStats, kpis } from './compute';
import { DEFAULT_RULES, type MatchEvent, type MatchEventData } from '../engine/match';

const H = { positions: [1, 2, 3, 4, 5, 6], liberos: [] };
const A = { positions: [11, 12, 13, 14, 15, 16], liberos: [] };

function seqOf(list: MatchEventData[]): MatchEvent[] {
  return list.map((e, i) => ({ ...e, seq: i + 1, set: 1 }) as MatchEvent);
}
const act = (side: 'H' | 'A', player: number, skill: string, evaluation: string, endZone?: number): MatchEventData =>
  ({ type: 'action', side, player, skill, evaluation, endZone }) as MatchEventData;

// Serveix el local. Jugades:
// 1) S+ / R- / A# visitant (12) → punt A (side-out A)
// 2) A serveix (12): S= → punt H (side-out H, error rival)
// 3) H serveix (2): S# ace + R= complementària → punt H (break-point H)
// 4) *e → punt A (error d'equip local; side-out A)
const events = seqOf([
  { type: 'lineup', home: H, away: A, serving: 'H' },
  act('H', 1, 'S', '+'),
  act('A', 15, 'R', '-'),
  act('A', 12, 'A', '#', 1),
  act('A', 12, 'S', '='),
  act('H', 2, 'S', '#'),
  act('A', 16, 'R', '='),
  { type: 'point', side: 'A', error: true },
]);

describe('estadístiques d’un partit', () => {
  const st = computeMatchStats(events, DEFAULT_RULES, { setters: { H: [1], A: [11] } });

  test('recomptes per jugador i fonament', () => {
    expect(st.players.A[12].skills.A).toMatchObject({ total: 1, '#': 1 });
    expect(st.players.A[12].skills.S).toMatchObject({ total: 1, '=': 1 });
    expect(st.players.A[16].skills.R['=']).toBe(1);
    expect(st.teams.A.skills.R.total).toBe(2);
  });

  test('origen dels punts', () => {
    expect(st.teams.H.points).toMatchObject({ total: 2, serve: 1, opponentErrors: 1 });
    expect(st.teams.A.points).toMatchObject({ total: 2, attack: 1, teamErrors: 1 });
  });

  test('side-out i break-point', () => {
    expect(st.rallies.map((r) => `${r.serving}>${r.winner}`)).toEqual(['H>A', 'A>H', 'H>H', 'H>A']);
    expect(st.teams.A.sideOut).toEqual({ won: 2, total: 3 });
    expect(st.teams.H.breakPoint).toEqual({ won: 1, total: 3 });
    expect(st.teams.H.sideOut).toEqual({ won: 1, total: 1 });
  });

  test('rotacions segons la posició del col·locador', () => {
    // A la 1a jugada el col·locador local (1) és a la posició I
    expect(st.rallies[0].rotation).toEqual({ H: 'P1', A: 'P1' });
    // A recupera el servei i rota: el seu col·locador (11) passa a VI
    expect(st.rallies[1].rotation.A).toBe('P6');
  });

  test('zones i indicadors', () => {
    expect(st.players.A[12].zones.A.end[1]).toMatchObject({ total: 1, '#': 1 });
    const k = kpis(st.teams.A.skills);
    expect(k.attack.kill).toBe(1);
    expect(k.reception.pos).toBe(0);
    expect(k.errors).toBe(2); // S= i R=
    expect(k.points).toBe(1);
  });

  test('filtre per set', () => {
    const none = computeMatchStats(events, DEFAULT_RULES, { set: 2 });
    expect(none.rallies).toHaveLength(0);
  });
});
