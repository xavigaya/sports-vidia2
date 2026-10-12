import { describe, expect, test } from 'vitest';
import { formatTime, parseYouTubeId } from './youtube';
import { buildClips, EMPTY_FILTER } from './clips';
import { DEFAULT_RULES, type MatchEvent } from '../engine/match';

describe('YouTube', () => {
  test('reconeix els formats d’enllaç', () => {
    const id = 'dQw4w9WgXcQ';
    for (const u of [
      id,
      `https://www.youtube.com/watch?v=${id}&t=30s`,
      `https://youtu.be/${id}?si=abc`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `youtube.com/watch?v=${id}`,
    ]) {
      expect(parseYouTubeId(u)).toBe(id);
    }
    expect(parseYouTubeId('https://vimeo.com/123')).toBeNull();
    expect(parseYouTubeId('hola')).toBeNull();
  });

  test('format de temps', () => {
    expect(formatTime(65.4)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(null)).toBe('–');
  });
});

describe('talls de vídeo', () => {
  const H = { positions: [1, 2, 3, 4, 5, 6], liberos: [] };
  const A = { positions: [11, 12, 13, 14, 15, 16], liberos: [] };
  const evs: MatchEvent[] = [
    { seq: 1, set: 1, type: 'lineup', home: H, away: A, serving: 'H', videoTime: 5 },
    { seq: 2, set: 1, type: 'action', side: 'H', player: 1, skill: 'S', evaluation: '+', videoTime: 10 },
    { seq: 3, set: 1, type: 'action', side: 'A', player: 15, skill: 'R', evaluation: '-', videoTime: 11 },
    { seq: 4, set: 1, type: 'action', side: 'A', player: 12, skill: 'A', evaluation: '#', videoTime: 14 },
    { seq: 5, set: 1, type: 'action', side: 'A', player: 12, skill: 'S', evaluation: '+', videoTime: null },
    { seq: 6, set: 1, type: 'action', side: 'A', player: 12, skill: 'S', evaluation: '=', videoTime: 40 },
  ];

  test('totes les accions amb instant', () => {
    const c = buildClips(evs, DEFAULT_RULES, EMPTY_FILTER, 5, 2);
    expect(c.map((x) => x.seq)).toEqual([2, 3, 4, 6]);
    expect(c[0]).toMatchObject({ start: 5, end: 12 });
  });

  test('filtres per equip, jugador, fonament i punt', () => {
    expect(buildClips(evs, DEFAULT_RULES, { ...EMPTY_FILTER, side: 'A', player: 12 }, 5, 2).map((x) => x.seq)).toEqual([4, 6]);
    expect(buildClips(evs, DEFAULT_RULES, { ...EMPTY_FILTER, skills: ['A'] }, 5, 2).map((x) => x.seq)).toEqual([4]);
    expect(buildClips(evs, DEFAULT_RULES, { ...EMPTY_FILTER, pointsOnly: true }, 5, 2).map((x) => x.seq)).toEqual([4, 6]);
    expect(buildClips(evs, DEFAULT_RULES, { ...EMPTY_FILTER, evaluations: ['-', '='] }, 5, 2).map((x) => x.seq)).toEqual([3, 6]);
  });

  test('marcador abans de cada acció', () => {
    const c = buildClips(evs, DEFAULT_RULES, EMPTY_FILTER, 5, 2);
    expect(c.find((x) => x.seq === 6)).toMatchObject({ scoreH: 0, scoreA: 1 });
  });
});

describe('pausa automàtica', () => {
  test('el retard es limita entre 0,3 i 10 s', async () => {
    const { clampDelay } = await import('./autoPause');
    expect(clampDelay(1)).toBe(1);
    expect(clampDelay(0)).toBe(0.3);
    expect(clampDelay(25)).toBe(10);
    expect(clampDelay(1.26)).toBe(1.3);
    expect(clampDelay(Number.NaN)).toBe(1);
  });
});

describe('filtre a l’URL', () => {
  test('anada i tornada', async () => {
    const { filterToParam, paramToFilter } = await import('./clips');
    const f = paramToFilter(filterToParam({ side: 'A', player: 7, skills: ['A'], evaluations: ['='], set: 2 }));
    expect(f).toEqual({ side: 'A', player: 7, skills: ['A'], evaluations: ['='], set: 2, pointsOnly: false });
    expect(paramToFilter('no-json')).toBeNull();
  });
});

describe('llista de YouTube', () => {
  test('accepta l’ID o l’enllaç', async () => {
    const { parsePlaylistId } = await import('./youtubeUpload');
    expect(parsePlaylistId('https://www.youtube.com/playlist?list=PLabc123DEF456')).toBe('PLabc123DEF456');
    expect(parsePlaylistId('PLabc123DEF456')).toBe('PLabc123DEF456');
    expect(parsePlaylistId('')).toBeNull();
    expect(parsePlaylistId('hola que tal')).toBeNull();
  });
});
