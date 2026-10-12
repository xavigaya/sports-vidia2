import { describe, expect, test } from 'vitest';
import { decodeDvw, dvwToEvents, encodeLatin1, exportDvw, parseDvw, type ExportInput } from './dvw';
import { DEFAULT_RULES, replay, type MatchEvent, type MatchEventData } from '../engine/match';

const H = { positions: [1, 2, 3, 4, 5, 6], liberos: [10] };
const A = { positions: [11, 12, 13, 14, 15, 16], liberos: [] };
const act = (side: 'H' | 'A', player: number, skill: string, evaluation: string, startZone?: number, endZone?: number): MatchEventData =>
  ({ type: 'action', side, player, skill, evaluation, startZone, endZone }) as MatchEventData;

function build(list: MatchEventData[]): MatchEvent[] {
  return list.map((e, i) => ({ ...e, seq: i + 1, set: 1, videoTime: 10 + i * 3 }) as MatchEvent);
}

const pl = (n: number, pos: 'S' | 'OH' | 'MB' | 'L' | 'OPP' = 'OH') => ({
  number: n,
  firstName: `Nom${n}`,
  lastName: `Cognom${n}`,
  nickname: '',
  position: pos,
  libero: pos === 'L',
});

const input = (events: MatchEvent[]): ExportInput => ({
  date: '2026-10-10T18:30:00',
  season: '2026-2027',
  league: 'Lliga',
  phase: 'J3',
  teams: [
    { code: 'CAP', name: 'Caparrella', coach: 'Entrenadora', assistant: '' },
    { code: 'RIV', name: 'Rival', coach: '', assistant: '' },
  ],
  players: {
    H: [pl(1, 'S'), pl(2), pl(3, 'MB'), pl(4), pl(5), pl(6, 'MB'), pl(7), pl(10, 'L')],
    A: [11, 12, 13, 14, 15, 16, 17].map((n) => pl(n, n === 11 ? 'S' : 'OH')),
  },
  events,
  rules: DEFAULT_RULES,
  video: 'partit.mp4',
});

// Set 1: 25-23 amb accions, un canvi, un temps mort i errors d'equip
function set1(): MatchEventData[] {
  const list: MatchEventData[] = [{ type: 'lineup', home: H, away: A, serving: 'H' }];
  // Primera jugada completa: servei, recepció, col·locació, atac guanyador del visitant
  list.push(act('H', 1, 'S', '+', 1, 6), act('A', 15, 'R', '-'), act('A', 11, 'E', '+'), act('A', 12, 'A', '#', 4, 1));
  list.push({ type: 'timeout', side: 'H' });
  list.push({ type: 'sub', side: 'A', out: 13, in: 17 });
  // Ace + error de recepció (complementària)
  list.push(act('A', 12, 'S', '#'), act('H', 5, 'R', '='));
  // Resta del set a cops de punt
  let h = 0;
  let a = 2;
  while (a < 23) {
    list.push(h % 4 === 0 ? { type: 'point', side: 'H', error: true } : { type: 'point', side: 'H' });
    h++;
    list.push({ type: 'point', side: 'A' });
    a++;
  }
  while (h < 25) {
    list.push({ type: 'point', side: 'H' });
    h++;
  }
  return list;
}

describe('DataVolley', () => {
  test('exporta i torna a llegir el mateix partit', () => {
    const events = build(set1());
    const original = replay(events, DEFAULT_RULES).state;
    expect(original.sets[0]).toMatchObject({ home: 25, away: 23 });

    const text = exportDvw(input(events));
    expect(text).toContain('[3SCOUT]');
    expect(text).toMatch(/\*01SH\+~~~16/);
    expect(text).toMatch(/a12AH#~~~41/);

    const dv = parseDvw(text);
    expect(dv.date).toBe('2026-10-10');
    expect(dv.teams[0]).toMatchObject({ code: 'CAP', name: 'Caparrella', coach: 'Entrenadora' });
    expect(dv.players.H).toHaveLength(8);
    expect(dv.players.H.find((p) => p.number === 10)).toMatchObject({ libero: true, position: 'L' });
    expect(dv.players.H.find((p) => p.number === 1)?.starts[0]).toBe(1);
    expect(dv.sets).toEqual([{ h: 25, a: 23 }]);
    expect(dv.video).toBe('partit.mp4');

    const imp = dvwToEvents(dv);
    expect(imp.warnings).toEqual([]);
    expect(imp.state.sets[0]).toMatchObject({ home: 25, away: 23, winner: 'H' });
    // Accions, canvi i temps mort conservats
    expect(imp.events.filter((e) => e.type === 'action')).toHaveLength(6);
    expect(imp.events.some((e) => e.type === 'sub')).toBe(true);
    expect(imp.events.some((e) => e.type === 'timeout')).toBe(true);
    expect(imp.events.find((e) => e.type === 'action' && e.skill === 'A')).toMatchObject({ startZone: 4, endZone: 1, videoTime: 22 });
  });

  test('l’ordre de les línies posa la complementària abans del punt', () => {
    const text = exportDvw(input(build(set1())));
    const scout = text.split('[3SCOUT]')[1].split(/\r\n/).map((l) => l.split(';')[0]).filter(Boolean);
    const ace = scout.indexOf('a12SH#~~~~~');
    expect(scout.slice(ace, ace + 3)).toEqual(['a12SH#~~~~~', '*05RH=~~~~~', 'ap00:02']);
  });

  test('llegeix un fitxer escrit per un altre programa', () => {
    const text = [
      '[3DATAVOLLEYSCOUT]',
      '[3MATCH]',
      '12/03/2026;20.00.00;2025-2026;Superliga;Fase regular;;;;',
      '[3TEAMS]',
      'AAA;Equip A;1;Coach A;;',
      'BBB;Equip B;0;Coach B;;',
      '[3SET]',
      'True;8-5;16-11;21-16;25-19;29;',
      '[3PLAYERS-H]',
      ...[1, 2, 3, 4, 5, 6].map((n) => `0;${n};${n};${n};;;;;A${n};Cognom${n};Nom${n};;;${n === 1 ? 5 : 2};False;;;`),
      '0;9;9;;;;;;A9;Lib;Ero;;L;1;False;;;',
      '[3PLAYERS-V]',
      ...[11, 12, 13, 14, 15, 16].map((n) => `1;${n};${n};${n - 10};;;;;B${n};Cognom${n};Nom${n};;;2;False;;;`),
      '[3SCOUT]',
      '*01SM+~~~16A;s;;;;;;20.01.00;1;1;1;1;100;;1;2;3;4;5;6;11;12;13;14;15;16;',
      'a15RM-~~~16A;s;;;;;;20.01.02;1;1;1;1;102;;1;2;3;4;5;6;11;12;13;14;15;16;',
      'a12AH=~~~41;s;;;;;;20.01.05;1;1;1;1;105;;1;2;3;4;5;6;11;12;13;14;15;16;',
      '*p01:00;s;;;;;;20.01.06;1;1;1;1;106;;1;2;3;4;5;6;11;12;13;14;15;16;',
      '*09DH+;s;;;;;;20.01.20;1;1;1;1;120;;1;2;3;4;5;6;11;12;13;14;15;16;',
      'ap01:01;s;;;;;;20.01.25;1;1;1;1;125;;1;2;3;4;5;6;11;12;13;14;15;16;',
      '**1set;;;;;;;;1;;;;;;;;;;;;;;;;;;',
    ].join('\n');
    const dv = parseDvw(text);
    expect(dv.date).toBe('2026-03-12');
    expect(dv.teams[1].name).toBe('Equip B');
    expect(dv.sets).toEqual([{ h: 25, a: 19 }]);
    const imp = dvwToEvents(dv);
    // L'error d'atac dona el punt al local; el *p01:00 no el torna a sumar
    expect(imp.events.filter((e) => e.type === 'point' && e.side === 'H')).toHaveLength(24);
    // El líbero (9) pot fer accions encara que no consti al camp
    expect(imp.events.some((e) => e.type === 'action' && e.player === 9)).toBe(true);
    // El set es completa fins al resultat final
    expect(imp.state.sets[0]).toMatchObject({ home: 25, away: 19 });
    expect(imp.warnings).toEqual([]);
  });

  test('codificació Latin-1', () => {
    const bytes = encodeLatin1('Col·locadora àèíòú ç');
    expect(decodeDvw(bytes.buffer as ArrayBuffer)).toBe('Col·locadora àèíòú ç');
  });
});
