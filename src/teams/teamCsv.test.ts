import { describe, expect, test } from 'vitest';
import { parseCsv, toCsv } from '../lib/csv';
import { parsePosition, parseTeamCsv, teamsToCsv } from './teamCsv';

describe('CSV', () => {
  test('separador ; amb cometes i BOM', () => {
    const rows = parseCsv('﻿a;b;c\r\n1;"x;y";"di ""hola"""\r\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x;y', 'di "hola"'],
    ]);
  });

  test('separador ,', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('anada i tornada', () => {
    const csv = toCsv([
      ['nom', 'nota'],
      ['Maria', 'té; punt i coma'],
    ]);
    expect(parseCsv(csv)).toEqual([
      ['nom', 'nota'],
      ['Maria', 'té; punt i coma'],
    ]);
  });
});

describe('plantilles CSV', () => {
  test('capçaleres en català, castellà o anglès', () => {
    const r = parseTeamCsv('Equipo;Dorsal;Nombre;Apellidos;Posición;Capitán\nCV Lleida;7;Anna;Puig Roca;Central;sí\n');
    expect(r.errors).toEqual([]);
    expect(r.hasTeamColumn).toBe(true);
    expect(r.rows[0]).toMatchObject({ team: 'CV Lleida', number: 7, firstName: 'Anna', lastName: 'Puig Roca', position: 'MB', captain: true });
  });

  test('sense columna d’equip i amb errors de fila', () => {
    const r = parseTeamCsv('dorsal,nom\n1,Joan\nX,Pere\n3,\n');
    expect(r.hasTeamColumn).toBe(false);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([
      { line: 3, message: 'bad_number' },
      { line: 4, message: 'no_name' },
    ]);
  });

  test('falta el dorsal', () => {
    expect(parseTeamCsv('nom;cognoms\nA;B\n').errors[0].message).toBe('no_number');
  });

  test('posicions', () => {
    expect(parsePosition('Col·locador')).toBe('S');
    expect(parsePosition('Líbero')).toBe('L');
    expect(parsePosition('Universal')).toBe('UNI');
    expect(parsePosition('opposite')).toBe('OPP');
    expect(parsePosition('')).toBe('U');
  });

  test('exportació i reimportació', () => {
    const csv = teamsToCsv([
      {
        name: 'Rival',
        code: 'RIV',
        category: 'Sènior',
        is_own: false,
        players: [
          {
            shirt_number: 9,
            position: 'OH',
            is_captain: false,
            players: { first_name: 'Nom9', last_name: 'Cognom9', nickname: null, is_minor: true, image_consent: false },
          },
        ],
      },
    ]);
    const r = parseTeamCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ team: 'Rival', teamCode: 'RIV', own: false, number: 9, firstName: 'Nom9', position: 'OH', minor: true });
  });
});
