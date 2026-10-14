import { describe, expect, test } from 'vitest';
import { DEFAULT_RULES, type MatchEvent, type MatchEventData } from '../engine/match';
import { emptyEval } from '../stats/compute';
import { computeMatchReport, formatDuration, gsEfficiency, gsPct, gsPerfect } from './reportData';

const H = { positions: [1, 2, 3, 4, 5, 6], liberos: [10] };
const A = { positions: [11, 12, 13, 14, 15, 16], liberos: [] };

const t0 = Date.parse('2026-10-11T16:00:00Z');
function seqOf(list: MatchEventData[], secondsApart = 30): MatchEvent[] {
  return list.map((e, i) => ({ ...e, seq: i + 1, set: 1, at: new Date(t0 + i * secondsApart * 1000).toISOString() }) as MatchEvent);
}
const act = (side: 'H' | 'A', player: number, skill: string, evaluation: string): MatchEventData =>
  ({ type: 'action', side, player, skill, evaluation }) as MatchEventData;

describe('eficiència de Click&Scout', () => {
  const c = (o: Partial<Record<string, number>>) => {
    const e = emptyEval() as unknown as Record<string, number>;
    for (const [k, v] of Object.entries(o)) e[k] = v ?? 0;
    e.total = Object.entries(o).reduce((n, [, v]) => n + (v ?? 0), 0);
    return e as unknown as ReturnType<typeof emptyEval>;
  };
  test('fórmules (valors de l’informe d’exemple)', () => {
    // Servei d'Asensio: 8 = 2, - 3, ! 3 → *E% 38%
    expect(gsPct(gsEfficiency('S', c({ '=': 2, '-': 3, '!': 3 })))).toBe('38%');
    // Recepció de l'equip: 59 (= 4, / 3, - 14, + 19, # 19) → #% 32%, *E% 64%
    const r = c({ '=': 4, '/': 3, '-': 14, '+': 19, '#': 19 });
    expect(gsPct(gsPerfect(r))).toBe('32%');
    expect(gsPct(gsEfficiency('R', r))).toBe('64%');
    // Atac de l'equip: 75 (= 11, - 1, ! 19, + 25, # 19) → *E% 11%
    expect(gsPct(gsEfficiency('A', c({ '=': 11, '-': 1, '!': 19, '+': 25, '#': 19 })))).toBe('11%');
    // Bloqueig de l'equip: 14 (= 7, - 4, ! 1, # 2) → *E% -36%
    expect(gsPct(gsEfficiency('B', c({ '=': 7, '-': 4, '!': 1, '#': 2 })))).toBe('-36%');
    // 0% i sense dades: buit
    expect(gsPct(gsEfficiency('A', c({ '-': 2 })))).toBe('');
    expect(gsPct(null)).toBe('');
  });
});

describe('informe del partit', () => {
  // Serveix el local.
  // 1) S1+ R15- A12# → punt A
  // 2) S12= → punt H (error de servei)
  // 3) H rota: serveix 2. S2# + R16= → punt H (break-point de 2)
  // 4) S2+ R15+ A13/ B4# → punt H (bloqueig de 4, break-point; A13/ complementari)
  // 5) canvi H 3→7, líbero 10 per 5, *e → punt A
  const events = seqOf([
    { type: 'lineup', home: H, away: A, serving: 'H' },
    act('H', 1, 'S', '+'),
    act('A', 15, 'R', '-'),
    act('A', 12, 'A', '#'),
    act('A', 12, 'S', '='),
    act('H', 2, 'S', '#'),
    act('A', 16, 'R', '='),
    act('H', 2, 'S', '+'),
    act('A', 15, 'R', '+'),
    act('H', 4, 'B', '#'),
    act('A', 13, 'A', '/'),
    { type: 'sub', side: 'H', out: 3, in: 7 },
    { type: 'libero', side: 'H', libero: 10, player: 1 },
    { type: 'point', side: 'A', error: true },
  ]);
  const r = computeMatchReport(events, DEFAULT_RULES, { setters: { H: [1], A: [11] } });

  test('punts, break-points i guanyats-perduts per jugador', () => {
    expect(r.sides.H.players[2].line).toMatchObject({ points: 1, bp: 1, won: 1, lost: 0 });
    expect(r.sides.H.players[2].line.serve).toEqual({ tot: 2, err: 0, pts: 1 });
    expect(r.sides.H.players[4].line).toMatchObject({ points: 1, bp: 1 });
    expect(r.sides.H.players[4].line.block.pts).toBe(1);
    expect(r.sides.A.players[12].line).toMatchObject({ points: 1, bp: 0, won: 1, lost: 1 });
    expect(r.sides.A.players[16].line).toMatchObject({ lost: 1 });
    expect(r.sides.A.players[13].line.attack).toEqual({ tot: 1, err: 0, blocked: 1, pts: 0 });
    expect(r.sides.A.players[15].line.reception).toEqual({ tot: 2, err: 0, pos: 1, exc: 0 });
  });

  test('totals d’equip i punts guanyats per set', () => {
    expect(r.sides.H.total.points).toBe(2);
    expect(r.sides.H.pointsWon[1]).toEqual({ serve: 1, attack: 0, block: 1, opponentErrors: 1 });
    expect(r.sides.A.pointsWon[1]).toEqual({ serve: 0, attack: 1, block: 0, opponentErrors: 1 });
    expect(r.sides.A.perSet[1].attack.tot).toBe(2);
  });

  test('participació als sets', () => {
    expect(r.sides.H.players[1].sets[1]).toEqual({ kind: 'start', position: 1, setter: true });
    expect(r.sides.H.players[3].sets[1]).toEqual({ kind: 'start', position: 3, setter: false });
    expect(r.sides.H.players[7].sets[1]).toEqual({ kind: 'sub' });
    expect(r.sides.H.players[10].sets[1]).toEqual({ kind: 'libero' });
    expect(r.sets[0].firstServe).toBe('H');
  });

  test('durada', () => {
    expect(r.sets[0].duration).toBe(13 * 30);
    expect(formatDuration(r.sets[0].duration)).toBe('0:07');
    expect(formatDuration(3600 + 25 * 60)).toBe('1:25');
  });

  test('parcials a 8, 16 i 21', () => {
    const list: MatchEventData[] = [{ type: 'lineup', home: H, away: A, serving: 'H' }];
    // 7-7 alternant i després 8-7, … fins a 25-20
    for (let i = 0; i < 7; i++) list.push({ type: 'point', side: 'H' }, { type: 'point', side: 'A' });
    for (let i = 0; i < 18; i++) list.push({ type: 'point', side: i % 3 === 2 ? 'A' : 'H' });
    while (list.length < 200) list.push({ type: 'point', side: 'H' });
    const rep = computeMatchReport(seqOf(list, 1), DEFAULT_RULES);
    const set1 = rep.sets[0];
    expect(set1.partials[0]).toEqual({ h: 8, a: 7 });
    expect(set1.partials.map((p) => Math.max(p.h, p.a))).toEqual([8, 16, 21]);
    // Durada massa curta (importats): sense valor
    expect(set1.duration).toBeNull();
  });
});
