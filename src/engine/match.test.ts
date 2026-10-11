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
import { eventCode, parseCommand, resolveAction, type PartialAction } from './commands';
import { pointWinner, zoneAt, actionCode } from './actions';

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
  const one = (input: string) => {
    const r = parseCommand(input);
    if (!r.ok) throw new Error(r.error);
    return r.events[0];
  };

  test('codis de marcador', () => {
    expect(one('*p')).toEqual({ type: 'point', side: 'H' });
    expect(one('AP')).toEqual({ type: 'point', side: 'A' });
    expect(one('aT')).toEqual({ type: 'timeout', side: 'A' });
    expect(one('*c3:13')).toEqual({ type: 'sub', side: 'H', out: 3, in: 13 });
    expect(one('ac4.12')).toEqual({ type: 'sub', side: 'A', out: 4, in: 12 });
    expect(one('*l10:5')).toEqual({ type: 'libero', side: 'H', libero: 10, player: 5 });
  });

  test('accions de joc', () => {
    expect(one('*12SH#16')).toEqual({
      type: 'partial_action', side: 'H', player: 12, skill: 'S', skillType: 'H', evaluation: '#', startZone: 1, endZone: 6,
    });
    expect(one('a7r+')).toMatchObject({ side: 'A', player: 7, skill: 'R', evaluation: '+', skillType: null });
    expect(one('4A=')).toMatchObject({ side: null, player: 4, skill: 'A', evaluation: '=' });
    expect(one('S/')).toMatchObject({ side: null, player: null, skill: 'S', evaluation: '/' });
    expect(one('a11E!~5')).toMatchObject({ side: 'A', player: 11, skill: 'E', startZone: null, endZone: 5 });
  });

  test('diversos codis en una línia', () => {
    const r = parseCommand('S+ 13R- a12A#');
    expect(r.ok && r.events.length).toBe(3);
  });

  test('errors', () => {
    expect(parseCommand('')).toMatchObject({ ok: false, error: 'empty' });
    expect(parseCommand('xp')).toMatchObject({ ok: false, error: 'side' });
    expect(parseCommand('*q')).toMatchObject({ ok: false, error: 'syntax' });
    expect(parseCommand('*c3')).toMatchObject({ ok: false, error: 'syntax' });
    expect(parseCommand('A#')).toMatchObject({ ok: false, error: 'player_required' });
    expect(parseCommand('*p 5X+')).toMatchObject({ ok: false, error: 'syntax', token: '5X+' });
  });

  test('completa equip i dorsal amb l’estat', () => {
    const s = start('A');
    expect(resolveAction(s, one('S#') as PartialAction)).toMatchObject({ side: 'A', player: 11 });
    expect(resolveAction(s, one('3R+') as PartialAction)).toMatchObject({ side: 'H', player: 3 });
    expect(resolveAction(s, one('5A+') as PartialAction)).toMatchObject({ side: 'H' });
  });

  test('codi d’esdeveniment', () => {
    expect(eventCode({ type: 'sub', side: 'A', out: 3, in: 13 })).toBe('ac03:13');
    expect(eventCode({ type: 'point', side: 'H' })).toBe('*p');
    expect(actionCode({ side: 'A', player: 7, skill: 'A', skillType: 'Q', evaluation: '#', startZone: 3, endZone: 5 })).toBe('a07AQ#35');
  });
});

describe('accions de joc', () => {
  const act = (side: 'H' | 'A', player: number, skill: 'S' | 'R' | 'E' | 'A' | 'B' | 'D' | 'F', evaluation: '#' | '+' | '!' | '-' | '/' | '='): MatchEventData => ({
    type: 'action', side, player, skill, evaluation,
  });

  test('qui guanya el punt', () => {
    expect(pointWinner({ side: 'H', skill: 'S', evaluation: '#' })).toBe('H');
    expect(pointWinner({ side: 'H', skill: 'S', evaluation: '=' })).toBe('A');
    expect(pointWinner({ side: 'A', skill: 'A', evaluation: '#' })).toBe('A');
    expect(pointWinner({ side: 'A', skill: 'A', evaluation: '/' })).toBe('H');
    expect(pointWinner({ side: 'H', skill: 'B', evaluation: '#' })).toBe('H');
    expect(pointWinner({ side: 'H', skill: 'R', evaluation: '=' })).toBe('A');
    expect(pointWinner({ side: 'H', skill: 'R', evaluation: '#' })).toBeNull();
    expect(pointWinner({ side: 'H', skill: 'D', evaluation: '+' })).toBeNull();
  });

  test('una jugada completa suma el punt', () => {
    let s = start('H');
    s = apply(s, act('H', 1, 'S', '+'), act('A', 15, 'R', '-'), act('A', 13, 'E', '+'), act('A', 14, 'A', '#'));
    expect(s.score).toEqual({ H: 0, A: 1 });
    expect(s.serving).toBe('A');
    expect(s.rally).toEqual([]);
  });

  test('ace i error de servei', () => {
    let s = apply(start('H'), act('H', 1, 'S', '#'));
    expect(s.score).toEqual({ H: 1, A: 0 });
    s = apply(s, act('H', 1, 'S', '='));
    expect(s.score).toEqual({ H: 1, A: 1 });
  });

  test('validacions', () => {
    const s = start('H');
    expectError(() => apply(s, act('H', 2, 'S', '+')), 'not_server');
    expectError(() => apply(s, act('A', 11, 'S', '+')), 'not_serving_team');
    expectError(() => apply(s, act('H', 1, 'R', '+')), 'not_receiving_team');
    expectError(() => apply(s, act('A', 99, 'D', '+')), 'player_not_on_court');
  });

  test('el líbero pot fer accions', () => {
    const s = apply(start('A'), { type: 'libero', side: 'H', libero: 10, player: 6 }, act('H', 10, 'R', '#'));
    expect(s.rally).toHaveLength(1);
  });
});

describe('zones', () => {
  test('mig camp local (esquerra)', () => {
    expect(zoneAt({ x: 1, y: 8 })).toEqual({ half: 'H', zone: 1 });
    expect(zoneAt({ x: 8, y: 1 })).toEqual({ half: 'H', zone: 4 });
    expect(zoneAt({ x: 4, y: 4.5 })).toEqual({ half: 'H', zone: 8 });
  });
  test('mig camp visitant (dreta), mirall', () => {
    expect(zoneAt({ x: 17, y: 1 })).toEqual({ half: 'A', zone: 1 });
    expect(zoneAt({ x: 10, y: 8 })).toEqual({ half: 'A', zone: 4 });
    expect(zoneAt({ x: 16, y: 4.5 })).toEqual({ half: 'A', zone: 6 });
  });
  test('fora del camp', () => {
    expect(zoneAt({ x: -1, y: 4 })).toBeNull();
  });
});

describe('líbero automàtic', () => {
  // Centrals: 3 i 6 (local). El 6 és a la posició VI.
  const HA = { ...H, autoLibero: true, middles: [3, 6] };

  test('a l’inici del set entra pel central de la zaga', () => {
    const s = applyEvent(initialState(), { type: 'lineup', home: HA, away: A, serving: 'A' });
    expect(s.teams.H.libero).toEqual({ libero: 10, replaces: 6 });
    expect(s.notices[0]).toBe('libero_auto_in:H:10:6');
  });

  test('entra quan el central acaba de servir i l’equip perd el servei', () => {
    // El 3 és a la posició II i el 6 a la IV (tots dos a la davantera)
    const lineup = { ...HA, positions: [4, 3, 5, 6, 1, 2], middles: [3, 6] };
    let s = applyEvent(initialState(), { type: 'lineup', home: lineup, away: A, serving: 'A' });
    expect(s.teams.H.libero).toBeNull();
    s = apply(s, pt('H')); // H recupera el servei i rota: el 3 passa a la I i serveix
    expect(onCourt(s.teams.H)[0]).toBe(3);
    s = apply(s, pt('H')); // continua servint
    expect(s.teams.H.libero).toBeNull();
    s = apply(s, pt('A')); // H perd el servei: entra el líbero pel 3
    expect(s.teams.H.libero).toEqual({ libero: 10, replaces: 3 });
    expect(s.notices).toContain('libero_auto_in:H:10:3');
  });

  test('sense l’opció activada no entra', () => {
    let s = applyEvent(initialState(), { type: 'lineup', home: { ...H, middles: [1] }, away: A, serving: 'H' });
    s = apply(s, pt('A'));
    expect(s.teams.H.libero).toBeNull();
  });
});

describe('convocatòria', () => {
  const rosters = { H: [1, 2, 3, 4, 5, 6, 7, 10], A: [11, 12, 13, 14, 15, 16, 20, 21] };

  test('no es pot alinear un jugador no convocat', () => {
    const s = initialState(DEFAULT_RULES, rosters);
    expectError(
      () => applyEvent(s, { type: 'lineup', home: { positions: [1, 2, 3, 4, 5, 9], liberos: [] }, away: A, serving: 'H' }),
      'not_in_roster',
    );
  });

  test('no pot entrar per canvi un jugador no convocat', () => {
    const s = applyEvent(initialState(DEFAULT_RULES, rosters), { type: 'lineup', home: H, away: A, serving: 'H' });
    expectError(() => applyEvent(s, { type: 'sub', side: 'H', out: 3, in: 13 }), 'not_in_roster');
    expect(applyEvent(s, { type: 'sub', side: 'H', out: 3, in: 7 }).teams.H.lineup).toContain(7);
  });

  test('replay rep les convocatòries', () => {
    const evs: MatchEvent[] = [
      { seq: 1, set: 1, type: 'lineup', home: H, away: A, serving: 'H' },
      { seq: 2, set: 1, type: 'sub', side: 'A', out: 11, in: 2 },
    ];
    expect(replay(evs, DEFAULT_RULES, rosters).errors.map((e) => e.error.code)).toEqual(['not_in_roster']);
  });
});

describe('líbero automàtic per defecte', () => {
  test('entra el líbero triat per defecte', () => {
    const away = { ...A, autoLibero: true, middles: [15, 12], defaultLibero: 21 };
    // A rep: el central 15 és a la posició V → entra el líbero 21
    const s = applyEvent(initialState(), { type: 'lineup', home: H, away, serving: 'H' });
    expect(s.teams.A.libero).toEqual({ libero: 21, replaces: 15 });
  });
});

describe('accions complementàries', () => {
  const act = (side: 'H' | 'A', player: number, skill: 'S' | 'R' | 'A' | 'B', evaluation: '#' | '=' | '/' | '+'): MatchEventData =>
    ({ type: 'action', side, player, skill, evaluation }) as MatchEventData;

  test('ace + error de recepció: un sol punt', () => {
    const s = apply(start('H'), act('H', 1, 'S', '#'), act('A', 15, 'R', '='));
    expect(s.score).toEqual({ H: 1, A: 0 });
  });

  test('atac bloquejat + punt de bloqueig: un sol punt', () => {
    const s = apply(start('H'), act('H', 1, 'S', '+'), act('A', 12, 'A', '/'), act('H', 3, 'B', '#'));
    expect(s.score).toEqual({ H: 1, A: 0 });
  });

  test('una acció del mateix equip després del punt sí que compta com a jugada nova', () => {
    const s = apply(start('H'), act('H', 1, 'S', '#'), act('H', 1, 'S', '#'));
    expect(s.score).toEqual({ H: 2, A: 0 });
  });
});
