import { describe, expect, test } from 'vitest';
import { emptyTeamStats } from './compute';
import { radarValues } from './radar';
import { sideColors as sideColorsTest } from './teamColors';

describe('gràfica de teranyina', () => {
  test('escala i valors', () => {
    const t = emptyTeamStats();
    // Recepció: 10 (4 # + 4 +) → 80% → 100
    t.skills.R.total = 10;
    t.skills.R['#'] = 4;
    t.skills.R['+'] = 4;
    // Servei: 20, 2 aces, 2 errors → 0% → 50
    t.skills.S.total = 20;
    t.skills.S['#'] = 2;
    t.skills.S['='] = 2;
    // Bloqueig: 6 punts en 3 sets → 2 per set → 50
    t.skills.B.total = 6;
    t.skills.B['#'] = 6;
    t.sideOut = { won: 11, total: 20 };
    const v = Object.fromEntries(radarValues(t, 3).map((x) => [x.key, x]));
    expect(v.reception.score).toBeCloseTo(1);
    expect(v.reception.display).toBe('80%');
    expect(v.serve.score).toBeCloseTo(0.5);
    expect(v.block.display).toBe('2.0');
    expect(v.block.score).toBeCloseTo(0.5);
    expect(v.sideOut.score).toBeCloseTo(0.5);
    expect(v.attackKill.score).toBeNull();
    expect(v.attackKill.display).toBe('–');
  });

  test('colors dels equips diferents', () => {
    const c = sideColorsTest({ color: '#0b5cab', is_own: true }, { color: '#0c5dab', is_own: false }, '#0b5cab');
    expect(c.H).not.toBe(c.A);
  });
});
