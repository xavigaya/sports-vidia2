import { describe, expect, test } from 'vitest';
import {
  applyEvent,
  DEFAULT_RULES,
  EngineError,
  initialState,
  onCourt,
  replay,
  rotate,
  server,
  suggestNextLineup,
  type MatchEvent,
  type MatchEventData,
  type MatchState,
} from './match';
import { eventCode, parseCommand } from './commands';

const H = { positions: [1, 2, 3, 4, 5, 6], liberos: [10] };
const A = { positions: [11, 12, 13, 14, 15, 16], liberos: [20, 21] };

function start(serving: 'H' | 'A' = 'H'): MatchState {
  return applyEvent(initialState(), { type: 'lineup', home: H, away: A, serving });
}

function apply(s: MatchState, ...evs: MatchEventData[]): MatchState {
  return evs.reduce(applyEvent, s);
}

function code(err: unknown): string {
  return err instanceof EngineError ? err.code : String(err);
}

function expectError(fn: () => unknown, c: string) {
  try {
    fn();
  } catch (e) {
    expect(code(e)).toBe(c);
    return;
  }
  throw new Error(`expected error ${c}`);
}

const pt = (side: 'H' | 'A'): MatchEventData => ({ type: 'point', side });

describe('rotació', () => {
  test('II passa a I i I passa a VI', () => {
    expect(rotate([1, 2, 3, 4, 5, 6])).toEqual([2, 3, 4, 5, 6, 1]);
  });
});

describe('punts i servei', () => {
  test('el servidor inicial és la posició I', () => {
    expect(server(start('H'))).toBe(1);
    expect(server(start('A'))).toBe(11);
  });

  test('punt de l’equip que serveix: no rota', () => {
    const s = apply(start('H'), pt('H'));
    expect(s.score).toEqual({ H: 1, A: 0 });
    expect(s.teams.H.lineup).toEqual(H.positions);
    expect(server(s)).toBe(1);
  });

  test('canvi de servei: rota l’equip que el recupera', () => {
    const s = apply(start('H'), pt('A'));
    expect(s.serving).toBe('A');
    expect(s.teams.A.lineup).toEqual([12, 13, 14, 15, 16, 11]);
    expect(s.teams.H.lineup).toEqual(H.positions);
    expect(server(s)).toBe(12);
  });

  test('el set acaba a 25 amb 2 punts d’avantatge', () => {
    let s = start('H');
    for (let i = 0; i < 24; i++) s = apply(s, pt('H'), pt('A'));
    expect(s.score).toEqual({ H: 24, A: 24 });
    s = apply(s, pt('H'));
    expect(s.phase).toBe('in_play');
    s = apply(s, pt('H'));
    expect(s.phase).toBe('awaiting_lineup');
    expect(s.setsWon).toEqual({ H: 1, A: 0 });
    expect(s.sets[0]).toMatchObject({ home: 26, away: 24, winner: 'H' });
  });

  test('el cinquè set és a 15 i el partit s’acaba', () => {
    let s = initialState();
    for (let set = 1; set <= 5; set++) {
      s = applyEvent(s, { type: 'lineup', home: H, away: A, serving: 'H' });
      const winner = set % 2 === 1 ? 'H' : 'A';
      const target = set === 5 ? 15 : 25;
      for (let i = 0; i < target; i++) s = applyEvent(s, pt(winner));
    }
    expect(s.phase).toBe('match_over');
    expect(s.winner).toBe('H');
    expect(s.setsWon).toEqual({ H: 3, A: 2 });
    expect(s.sets[4]).toMatchObject({ home: 15, away: 0 });
    expectError(() => applyEvent(s, pt('A')), 'match_over');
  });

  test('cal alineació abans de començar', () => {
    expectError(() => applyEvent(initialState(), pt('H')), 'needs_lineup');
  });

  test('alineació amb dorsals repetits', () => {
    expectError(
      () => applyEvent(initialState(), { type: 'lineup', home: { positions: [1, 1, 3, 4, 5, 6], liberos: [] }, away: A, serving: 'H' }),
      'duplicate_player',
    );
  });
});

describe('canvis', () => {
  test('canvi i retorn del titular pel mateix suplent', () => {
    let s = apply(start(), { type: 'sub', side: 'H', out: 3, in: 7 });
    expect(s.teams.H.lineup).toEqual([1, 2, 7, 4, 5, 6]);
    expect(s.teams.H.subsUsed).toBe(1);
    s = apply(s, { type: 'sub', side: 'H', out: 7, in: 3 });
    expect(s.teams.H.lineup).toEqual(H.positions);
    expect(s.teams.H.subsUsed).toBe(2);
  });

  test('el titular només pot tornar pel seu suplent', () => {
    let s = apply(start(), { type: 'sub', side: 'H', out: 3, in: 7 });
    expectError(() => apply(s, { type: 'sub', side: 'H', out: 7, in: 8 }), 'illegal_sub');
    s = apply(s, { type: 'sub', side: 'H', out: 4, in: 8 });
    expectError(() => apply(s, { type: 'sub', side: 'H', out: 8, in: 3 }), 'illegal_sub');
  });

  test('un titular no pot sortir dues vegades', () => {
    const s = apply(start(), { type: 'sub', side: 'H', out: 3, in: 7 }, { type: 'sub', side: 'H', out: 7, in: 3 });
    expectError(() => apply(s, { type: 'sub', side: 'H', out: 3, in: 9 }), 'illegal_sub');
  });

  test('un suplent només pot entrar una vegada per set', () => {
    const s = apply(start(), { type: 'sub', side: 'H', out: 3, in: 7 }, { type: 'sub', side: 'H', out: 7, in: 3 });
    expectError(() => apply(s, { type: 'sub', side: 'H', out: 4, in: 7 }), 'illegal_sub');
  });

  test('límit de canvis per set', () => {
    const rules = { ...DEFAULT_RULES, maxSubstitutions: 2 };
    let s = applyEvent(initialState(rules), { type: 'lineup', home: H, away: A, serving: 'H' });
    s = apply(s, { type: 'sub', side: 'H', out: 1, in: 7 }, { type: 'sub', side: 'H', out: 2, in: 8 });
    expectError(() => apply(s, { type: 'sub', side: 'H', out: 3, in: 9 }), 'max_subs');
  });

  test('els canvis es reinicien a cada set', () => {
    let s = apply(start(), { type: 'sub', side: 'H', out: 3, in: 7 });
    for (let i = 0; i < 25; i++) s = apply(s, pt('H'));
    s = applyEvent(s, { type: 'lineup', home: H, away: A, serving: 'A' });
    expect(s.teams.H.subsUsed).toBe(0);
    s = apply(s, { type: 'sub', side: 'H', out: 3, in: 7 });
    expect(s.teams.H.lineup).toContain(7);
  });

  test('no es pot canviar un jugador que és a la banqueta pel líbero', () => {
    const s = apply(start('A'), { type: 'libero', side: 'H', libero: 10, player: 5 });
    expectError(() => apply(s, { type: 'sub', side: 'H', out: 5, in: 7 }), 'sub_libero_replaced');
  });
});

describe('líbero', () => {
  test('entra per un jugador de la zaga', () => {
    const s = apply(start('A'), { type: 'libero', side: 'H', libero: 10, player: 6 });
    expect(onCourt(s.teams.H)).toEqual([1, 2, 3, 4, 5, 10]);
  });

  test('no pot entrar a la davantera', () => {
    expectError(() => apply(start('A'), { type: 'libero', side: 'H', libero: 10, player: 3 }), 'libero_front_row');
  });

  test('no pot entrar a la posició I si el seu equip serveix', () => {
    expectError(() => apply(start('H'), { type: 'libero', side: 'H', libero: 10, player: 1 }), 'libero_cannot_serve');
    // Si l'equip rep, sí
    const s = apply(start('A'), { type: 'libero', side: 'H', libero: 10, player: 1 });
    expect(onCourt(s.teams.H)[0]).toBe(10);
  });

  test('surt automàticament quan arribaria a la posició IV', () => {
    // El 5 és a la posició V; el líbero el substitueix
    let s = apply(start('A'), { type: 'libero', side: 'H', libero: 10, player: 5 });
    s = apply(s, pt('H')); // H recupera el servei i rota: el 5 passa a IV
    expect(s.teams.H.lineup.indexOf(5)).toBe(3);
    expect(s.teams.H.libero).toBeNull();
    expect(onCourt(s.teams.H)).toContain(5);
    expect(s.notices[0]).toBe('libero_auto_out:H:10:5');
  });

  test('només pot tornar el jugador que havia substituït', () => {
    const s = apply(start('A'), { type: 'libero', side: 'H', libero: 10, player: 6 });
    expectError(() => apply(s, { type: 'libero', side: 'H', libero: 10, player: 5 }), 'libero_must_return_for_replaced');
    const back = apply(s, { type: 'libero', side: 'H', libero: 10, player: 6 });
    expect(back.teams.H.libero).toBeNull();
  });

  test('canvi entre els dos líberos', () => {
    let s = apply(start('H'), { type: 'libero', side: 'A', libero: 20, player: 15 });
    s = apply(s, { type: 'libero', side: 'A', libero: 21, player: 20 });
    expect(s.teams.A.libero).toEqual({ libero: 21, replaces: 15 });
  });

  test('els canvis de líbero no compten com a canvis', () => {
    const s = apply(start('A'), { type: 'libero', side: 'H', libero: 10, player: 6 }, { type: 'libero', side: 'H', libero: 10, player: 6 });
    expect(s.teams.H.subsUsed).toBe(0);
  });
});

describe('temps morts', () => {
  test('màxim per set', () => {
    const s = apply(start(), { type: 'timeout', side: 'A' }, { type: 'timeout', side: 'A' });
    expect(s.teams.A.timeoutsUsed).toBe(2);
    expectError(() => apply(s, { type: 'timeout', side: 'A' }), 'max_timeouts');
  });
});

describe('reproducció i propostes', () => {
  test('replay ordena per seq i informa dels errors', () => {
    const evs: MatchEvent[] = [
      { seq: 2, set: 1, type: 'point', side: 'A' },
      { seq: 1, set: 1, type: 'lineup', home: H, away: A, serving: 'H' },
      { seq: 3, set: 1, type: 'timeout', side: 'H' },
      { seq: 4, set: 1, type: 'sub', side: 'H', out: 99, in: 7 },
    ];
    const { state, errors } = replay(evs);
    expect(state.score).toEqual({ H: 0, A: 1 });
    expect(state.lastSeq).toBe(3);
    expect(errors.map((e) => e.error.code)).toEqual(['player_not_on_court']);
  });

  test('el set següent proposa la mateixa alineació i alterna el servei', () => {
    let s = start('A');
    for (let i = 0; i < 25; i++) s = apply(s, pt('A'));
    expect(suggestNextLineup(s)).toEqual({ home: H, away: A, serving: 'H' });
  });
});

describe('línia d’ordres', () => {
  test('codis bàsics', () => {
    expect(parseCommand('*p')).toEqual({ ok: true, event: { type: 'point', side: 'H' } });
    expect(parseCommand('AP')).toEqual({ ok: true, event: { type: 'point', side: 'A' } });
    expect(parseCommand('aT')).toEqual({ ok: true, event: { type: 'timeout', side: 'A' } });
    expect(parseCommand('*c3:13')).toEqual({ ok: true, event: { type: 'sub', side: 'H', out: 3, in: 13 } });
    expect(parseCommand('a c 4.12')).toEqual({ ok: true, event: { type: 'sub', side: 'A', out: 4, in: 12 } });
    expect(parseCommand('*l10:5')).toEqual({ ok: true, event: { type: 'libero', side: 'H', libero: 10, player: 5 } });
  });

  test('errors', () => {
    expect(parseCommand('')).toEqual({ ok: false, error: 'empty' });
    expect(parseCommand('x p')).toEqual({ ok: false, error: 'side' });
    expect(parseCommand('*q')).toEqual({ ok: false, error: 'syntax' });
    expect(parseCommand('*c3')).toEqual({ ok: false, error: 'syntax' });
  });

  test('codi d’esdeveniment', () => {
    expect(eventCode({ type: 'sub', side: 'A', out: 3, in: 13 })).toBe('ac03:13');
    expect(eventCode({ type: 'point', side: 'H' })).toBe('*p');
  });
});
