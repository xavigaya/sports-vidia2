// Conversió entre plantilles (equips + jugadors) i CSV
import { norm, parseBool, parseCsv, toCsv } from '../lib/csv';
import type { PlayerPosition } from '../lib/types';

export interface CsvPlayerRow {
  team: string | null;
  teamCode: string | null;
  category: string | null;
  own: boolean | null;
  number: number;
  firstName: string;
  lastName: string;
  nickname: string | null;
  position: PlayerPosition;
  captain: boolean;
  minor: boolean;
  imageConsent: boolean;
}

export const EXPORT_HEADERS = [
  'equip',
  'codi_equip',
  'categoria',
  'propi',
  'dorsal',
  'nom',
  'cognoms',
  'alies',
  'posicio',
  'capita',
  'menor',
  'consentiment_imatge',
];

type Field = keyof CsvPlayerRow;

const ALIASES: Record<Field, string[]> = {
  team: ['equip', 'equipo', 'team', 'nomequip', 'nombreequipo', 'teamname'],
  teamCode: ['codiequip', 'codigoequipo', 'teamcode', 'codi', 'codigo', 'code'],
  category: ['categoria', 'category'],
  own: ['propi', 'propio', 'own', 'equippropi'],
  number: ['dorsal', 'numero', 'number', 'num', 'no', '#', 'shirt', 'samarreta'],
  firstName: ['nom', 'nombre', 'firstname', 'name', 'first'],
  lastName: ['cognoms', 'cognom', 'apellidos', 'apellido', 'lastname', 'surname', 'last'],
  nickname: ['alies', 'alias', 'nickname', 'sobrenom', 'apodo'],
  position: ['posicio', 'posicion', 'position', 'pos', 'rol', 'role'],
  captain: ['capita', 'capitana', 'capitan', 'captain'],
  minor: ['menor', 'menordedat', 'menordeedad', 'minor'],
  imageConsent: ['consentimentimatge', 'consentiment', 'consentimientoimagen', 'consentimiento', 'imageconsent', 'consent'],
};

const POSITION_ALIASES: Record<PlayerPosition, string[]> = {
  S: ['s', '5', 'collocador', 'collocadora', 'colocador', 'colocadora', 'setter', 'armador', 'armadora', 'col'],
  OH: ['oh', '2', 'receptor', 'receptora', 'punta', 'outside', 'outsidehitter', 'atacant', 'atacante', 'ext'],
  OPP: ['opp', '3', 'oposat', 'oposada', 'opuesto', 'opuesta', 'opposite', 'op'],
  MB: ['mb', '4', 'central', 'middle', 'middleblocker', 'cen'],
  L: ['l', '1', 'libero', 'lib'],
  UNI: ['uni', 'universal', 'u'],
  U: ['', '0', 'indeterminat', 'indeterminado', 'unknown', '?'],
};

export function parsePosition(v: string | undefined): PlayerPosition {
  const n = norm(v ?? '');
  for (const [pos, list] of Object.entries(POSITION_ALIASES) as [PlayerPosition, string[]][]) {
    if (list.includes(n)) return pos;
  }
  return 'U';
}

export interface CsvParseResult {
  rows: CsvPlayerRow[];
  errors: { line: number; message: 'no_header' | 'no_number' | 'no_name' | 'bad_number' }[];
  hasTeamColumn: boolean;
}

export function parseTeamCsv(text: string): CsvParseResult {
  const table = parseCsv(text);
  const errors: CsvParseResult['errors'] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: 'no_header' }], hasTeamColumn: false };

  const header = table[0].map(norm);
  const col = {} as Record<Field, number>;
  for (const field of Object.keys(ALIASES) as Field[]) {
    col[field] = header.findIndex((h) => ALIASES[field].includes(h));
  }
  if (col.number < 0) return { rows: [], errors: [{ line: 1, message: 'no_number' }], hasTeamColumn: false };
  if (col.firstName < 0 && col.lastName < 0) return { rows: [], errors: [{ line: 1, message: 'no_name' }], hasTeamColumn: false };

  const get = (r: string[], f: Field) => (col[f] >= 0 ? (r[col[f]] ?? '').trim() : '');
  const rows: CsvPlayerRow[] = [];
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const numText = get(r, 'number');
    const number = Number(numText);
    if (!numText || !Number.isInteger(number) || number < 0 || number > 99) {
      errors.push({ line, message: 'bad_number' });
      return;
    }
    const firstName = get(r, 'firstName');
    const lastName = get(r, 'lastName');
    if (!firstName && !lastName) {
      errors.push({ line, message: 'no_name' });
      return;
    }
    rows.push({
      team: get(r, 'team') || null,
      teamCode: get(r, 'teamCode') || null,
      category: get(r, 'category') || null,
      own: col.own >= 0 && get(r, 'own') !== '' ? parseBool(get(r, 'own')) : null,
      number,
      firstName: firstName || lastName,
      lastName: firstName ? lastName : '',
      nickname: get(r, 'nickname') || null,
      position: parsePosition(get(r, 'position')),
      captain: parseBool(get(r, 'captain')),
      minor: parseBool(get(r, 'minor')),
      imageConsent: parseBool(get(r, 'imageConsent')),
    });
  });
  return { rows, errors, hasTeamColumn: col.team >= 0 };
}

export interface ExportTeam {
  name: string;
  code: string | null;
  category: string | null;
  is_own: boolean;
  players: {
    shirt_number: number;
    position: PlayerPosition;
    is_captain: boolean;
    players: { first_name: string; last_name: string; nickname: string | null; is_minor: boolean; image_consent: boolean };
  }[];
}

export function teamsToCsv(teams: ExportTeam[]): string {
  const rows: (string | number | boolean | null)[][] = [EXPORT_HEADERS];
  for (const t of teams) {
    for (const p of [...t.players].sort((a, b) => a.shirt_number - b.shirt_number)) {
      rows.push([
        t.name,
        t.code,
        t.category,
        t.is_own,
        p.shirt_number,
        p.players.first_name,
        p.players.last_name,
        p.players.nickname,
        p.position,
        p.is_captain,
        p.players.is_minor,
        p.players.image_consent,
      ]);
    }
  }
  return toCsv(rows);
}
