// Intèrpret de la línia d'ordres, amb la notació de DataVolley per a
// les accions de marcador:
//
//   *p   punt local          ap   punt visitant
//   *T   temps mort local    aT   temps mort visitant
//   *c3:13   canvi local: surt el 3, entra el 13 (també "*c3.13" o "*c3 13")
//   *l7:5    líbero local 7 per (o de tornada pel) jugador 5   [extensió pròpia]
//
// "*" = equip local, "a" = equip visitant. Majúscules i minúscules indiferents.
// Les accions de joc (S, R, E, A, B, D, F) arribaran a la fase 3.

import type { MatchEventData, Side } from './match';

export type ParseResult = { ok: true; event: MatchEventData } | { ok: false; error: 'empty' | 'side' | 'syntax' };

const PAIR = /^(\d{1,2})\s*[:.\s]\s*(\d{1,2})$/;

export function parseCommand(input: string): ParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'empty' };

  const first = raw[0].toLowerCase();
  let side: Side;
  if (first === '*') side = 'H';
  else if (first === 'a') side = 'A';
  else return { ok: false, error: 'side' };

  const rest = raw.slice(1).trim();
  const op = rest[0]?.toLowerCase();
  const args = rest.slice(1).trim();

  switch (op) {
    case 'p':
      if (args) return { ok: false, error: 'syntax' };
      return { ok: true, event: { type: 'point', side } };
    case 't':
      if (args) return { ok: false, error: 'syntax' };
      return { ok: true, event: { type: 'timeout', side } };
    case 'c': {
      const m = PAIR.exec(args);
      if (!m) return { ok: false, error: 'syntax' };
      return { ok: true, event: { type: 'sub', side, out: Number(m[1]), in: Number(m[2]) } };
    }
    case 'l': {
      const m = PAIR.exec(args);
      if (!m) return { ok: false, error: 'syntax' };
      return { ok: true, event: { type: 'libero', side, libero: Number(m[1]), player: Number(m[2]) } };
    }
    default:
      return { ok: false, error: 'syntax' };
  }
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
  }
}
