// PDF "Informe del partit" (format semblant al Match Report de Click&Scout):
// una pàgina A4 vertical amb les dades del partit, els sets (durada, parcials
// i punts) i, per a cada equip, la taula de jugadors, els totals i el detall
// per set.
import type { Side } from '../engine/match';
import { PdfDocument, type PdfPage } from '../pdf/pdf';
import { emptyReportLine, formatDuration, type MatchReportData, type ReportLine, type SetParticipation } from './reportData';

export interface MrPlayer {
  number: number;
  name: string;
  libero: boolean;
  captain: boolean;
}

export interface MrTeam {
  name: string;
  players: MrPlayer[];
  coach?: string | null;
  assistant?: string | null;
}

export interface MrInput {
  competition: string;
  phase: string;
  date: string;
  time: string;
  city: string;
  hall: string;
  spectators: string;
  referees: string;
  teams: Record<Side, MrTeam>;
  report: MatchReportData;
}

export interface MrLabels {
  title: string;
  date: string;
  time: string;
  city: string;
  hall: string;
  spectators: string;
  referees: string;
  set: string;
  duration: string;
  partials: string;
  points: string;
  serve: string;
  reception: string;
  attack: string;
  block: string;
  tot: string;
  bp: string;
  wl: string;
  err: string;
  pts: string;
  pos: string;
  exc: string;
  blocked: string;
  ptsPct: string;
  teamTotals: string;
  pointsWon: string;
  pwServe: string;
  pwAttack: string;
  pwBlock: string;
  pwOpp: string;
  setN: (n: number) => string;
  coach: string;
  assistant: string;
  libero: string; // "L"
  captain: string; // "C"
  legend: string;
  legendStarter: string;
  legendSetter: string;
  legendSub: string;
  legendServe: string;
  footer: string;
}

const GRAY = '#dcdcdc';
const SHADE = '#c8c8c8';
const M = 28;

// Columnes (centre de cada valor, relatiu al marge)
const COL = {
  num: 2,
  flag: 17,
  name: 27,
  sets: 122, // 5 caselles de 16
  pTot: 212,
  pBp: 232,
  pWl: 254,
  sTot: 280,
  sErr: 297,
  sPts: 314,
  rTot: 336,
  rErr: 352,
  rPos: 373,
  rExc: 399,
  aTot: 425,
  aErr: 441,
  aBk: 456,
  aPts: 471,
  aPct: 491,
  bPts: 522,
};
// Separadors verticals dels grups
const GROUPS = { sets: 120, points: 202, serve: 268, reception: 325, attack: 415, block: 505, end: 539 };

const dot = (v: number) => (v ? String(v) : '.');
const pctTxt = (n: number, d: number) => (d > 0 && n > 0 ? `${Math.round((n / d) * 100)}%` : '.');
const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `${v}` : '.');

function lineValues(l: ReportLine, withPoints: boolean): [number, string][] {
  return [
    ...(withPoints
      ? ([
          [COL.pTot, dot(l.points)],
          [COL.pBp, dot(l.bp)],
          [COL.pWl, signed(l.won - l.lost)],
        ] as [number, string][])
      : []),
    [COL.sTot, dot(l.serve.tot)],
    [COL.sErr, dot(l.serve.err)],
    [COL.sPts, dot(l.serve.pts)],
    [COL.rTot, dot(l.reception.tot)],
    [COL.rErr, dot(l.reception.err)],
    [COL.rPos, pctTxt(l.reception.pos, l.reception.tot)],
    [COL.rExc, l.reception.exc > 0 ? `(${pctTxt(l.reception.exc, l.reception.tot)})` : '.'],
    [COL.aTot, dot(l.attack.tot)],
    [COL.aErr, dot(l.attack.err)],
    [COL.aBk, dot(l.attack.blocked)],
    [COL.aPts, dot(l.attack.pts)],
    [COL.aPct, pctTxt(l.attack.pts, l.attack.tot)],
    [COL.bPts, dot(l.block.pts)],
  ];
}

function drawValues(p: PdfPage, vals: [number, string][], y: number, size: number, bold = false) {
  for (const [x, v] of vals) p.text(v, M + x, y, { size, align: 'center', bold, color: v === '.' ? '#555555' : '#000000' });
}

function participationBox(p: PdfPage, x: number, y: number, part: SetParticipation | undefined, h: number) {
  const w = 12;
  if (!part) return;
  const bh = Math.min(8.5, h - 2);
  p.rect(x, y - bh + 1.5, w, bh, { fill: part.setter ? SHADE : null, stroke: '#000000', width: part.setter ? 0.9 : 0.5 });
  if (part.kind === 'start' && part.position) p.text(String(part.position), x + w / 2, y, { size: 6.5, align: 'center', bold: !!part.setter });
}

function header(p: PdfPage, d: MrInput, L: MrLabels) {
  const r = d.report;
  p.text(d.competition, M, 44, { size: 15, maxWidth: 280 });
  p.text(d.phase, M, 64, { size: 10, maxWidth: 280 });
  p.text(L.title, M, 92, { size: 14 });
  p.line(M, 99, M + 280, 99, { width: 0.8 });

  // Equips i resultat
  const bx = 320;
  const bw = p.width - M - bx;
  p.rect(bx, 28, bw, 60, { stroke: '#000000', width: 0.8 });
  (['H', 'A'] as Side[]).forEach((s, i) => {
    p.text(d.teams[s].name.toUpperCase(), bx + 6, 50 + i * 26, { size: 12, maxWidth: bw - 40 });
    p.text(String(r.setsWon[s]), bx + bw - 8, 50 + i * 26, { size: 14, align: 'right', bold: true });
  });

  // Dades del partit
  p.rect(M, 106, 280, 62, { stroke: '#000000', width: 0.6 });
  const info: [string, string][] = [
    [L.date, d.date],
    [L.time, d.time],
    [L.city, d.city],
  ];
  info.forEach(([k, v], i) => {
    p.text(k, M + 6, 122 + i * 14, { size: 8 });
    p.text(v, M + 60, 122 + i * 14, { size: 8, maxWidth: 95 });
  });
  p.text(L.spectators, M + 160, 122, { size: 8 });
  p.text(d.spectators, M + 220, 122, { size: 8, maxWidth: 56 });
  p.text(L.hall, M + 160, 136, { size: 8 });
  p.text(d.hall, M + 160, 150, { size: 8, maxWidth: 116 });
  p.rect(M, 174, 280, 18, { stroke: '#000000', width: 0.6 });
  p.text(L.referees, M + 6, 186, { size: 8 });
  p.text(d.referees, M + 60, 186, { size: 8, maxWidth: 214 });

  // Sets
  const cols = { set: bx, time: bx + 30, partial: bx + 78, points: bx + bw - 54, end: bx + bw };
  p.rect(bx, 106, bw, 13, { fill: GRAY, stroke: '#000000', width: 0.6 });
  p.text(L.set, cols.set + 15, 115.5, { size: 7.5, align: 'center' });
  p.text(L.duration, (cols.time + cols.partial) / 2, 115.5, { size: 7.5, align: 'center' });
  p.text(L.partials, (cols.partial + cols.points) / 2, 115.5, { size: 7.5, align: 'center' });
  p.text(L.points, (cols.points + cols.end) / 2, 115.5, { size: 7.5, align: 'center' });
  p.rect(bx, 119, bw, 52, { stroke: '#000000', width: 0.6 });
  for (const x of [cols.time, cols.partial, cols.points]) p.line(x, 106, x, 171, { width: 0.4 });
  r.sets.slice(0, 5).forEach((s, i) => {
    const y = 128 + i * 10;
    p.text(String(s.number), cols.set + 15, y, { size: 8, align: 'center' });
    p.text(formatDuration(s.duration), (cols.time + cols.partial) / 2, y, { size: 8, align: 'center' });
    const pw = (cols.points - cols.partial) / 3;
    s.partials.slice(0, 3).forEach((pt, j) => p.text(`${pt.h}-${pt.a}`, cols.partial + pw * j + pw / 2, y, { size: 8, align: 'center' }));
    p.text(`${s.home}-${s.away}`, (cols.points + cols.end) / 2, y, { size: 8, align: 'center', bold: true });
  });
  p.rect(bx, 176, bw, 16, { stroke: '#000000', width: 0.6 });
  p.text(formatDuration(r.duration), (cols.time + cols.partial) / 2, 187, { size: 8, align: 'center' });
  const th = r.sets.reduce((n, s) => n + s.home, 0);
  const ta = r.sets.reduce((n, s) => n + s.away, 0);
  p.text(`${th}-${ta}`, (cols.points + cols.end) / 2, 187, { size: 8, align: 'center', bold: true });
}

function teamSection(p: PdfPage, d: MrInput, side: Side, top: number, maxHeight: number, L: MrLabels): number {
  const team = d.teams[side];
  const rep = d.report.sides[side];
  const W = p.width - 2 * M;
  // Jugadors: convocats i qualsevol altre dorsal que surti a les dades
  const known = new Map(team.players.map((pl) => [pl.number, pl]));
  for (const n of Object.keys(rep.players).map(Number)) {
    if (!known.has(n)) known.set(n, { number: n, name: '', libero: false, captain: false });
  }
  const players = [...known.values()].sort((a, b) => a.number - b.number);

  // Capçalera
  p.rect(M, top, W, 26, { fill: GRAY, stroke: '#000000', width: 0.8 });
  p.text(team.name, M + 6, top + 17, { size: 11, maxWidth: GROUPS.sets - 10 });
  const g = (a: number, b: number, label: string) => p.text(label, M + (a + b) / 2, top + 9, { size: 8, align: 'center' });
  g(GROUPS.sets, GROUPS.points, L.set);
  g(GROUPS.points, GROUPS.serve, L.points);
  g(GROUPS.serve, GROUPS.reception, L.serve);
  g(GROUPS.reception, GROUPS.attack, L.reception);
  g(GROUPS.attack, GROUPS.block, L.attack);
  g(GROUPS.block, GROUPS.end, L.block);
  // Números de set amb un cercle al set en què l'equip va servir primer
  for (let i = 0; i < 5; i++) {
    const cx = M + COL.sets + i * 16 + 6;
    p.text(String(i + 1), cx, top + 21.5, { size: 7, align: 'center' });
    if (d.report.sets[i]?.firstServe === side) p.circle(cx, top + 19, 4.2, { width: 0.5 });
  }
  const sub: [number, string][] = [
    [COL.pTot, L.tot],
    [COL.pBp, L.bp],
    [COL.pWl, L.wl],
    [COL.sTot, L.tot],
    [COL.sErr, L.err],
    [COL.sPts, L.pts],
    [COL.rTot, L.tot],
    [COL.rErr, L.err],
    [COL.rPos, L.pos],
    [COL.rExc, L.exc],
    [COL.aTot, L.tot],
    [COL.aErr, L.err],
    [COL.aBk, L.blocked],
    [COL.aPts, L.pts],
    [COL.aPct, L.ptsPct],
    [COL.bPts, L.pts],
  ];
  for (const [x, v] of sub) p.text(v, M + x, top + 21.5, { size: 6.5, align: 'center' });

  // Mides
  const perSetH = 8.5;
  const blockH = 12 + 5 * perSetH + 4; // punts guanyats + 5 sets
  const totalsH = 13;
  const rowH = Math.max(8, Math.min(13, (maxHeight - 26 - totalsH - blockH) / Math.max(players.length, 1)));
  const size = rowH < 10 ? 7 : 7.5;

  let y = top + 26;
  for (const pl of players) {
    const base = y + rowH / 2 + 2.6;
    const data = rep.players[pl.number];
    p.text(String(pl.number), M + COL.num, base, { size });
    const flag = pl.libero ? L.libero : pl.captain ? L.captain : '';
    if (flag) p.text(flag, M + COL.flag, base, { size: size - 0.5 });
    p.text(pl.name, M + COL.name, base, { size, maxWidth: GROUPS.sets - COL.name - 2 });
    for (let i = 0; i < 5; i++) participationBox(p, M + COL.sets + i * 16, base, data?.sets[i + 1], rowH);
    drawValues(p, lineValues(data?.line ?? emptyReportLine(), true), base, size);
    y += rowH;
  }
  p.line(M, y, M + W, y, { width: 0.8 });

  // Totals de l'equip
  p.text(L.teamTotals, M + 6, y + 9.5, { size: 8.5, bold: true });
  drawValues(p, lineValues(rep.total, true), y + 9.5, 7.5, true);
  y += totalsH;
  p.line(M, y, M + W, y, { width: 0.8 });

  // Punts guanyats i detall per set
  const bTop = y;
  p.rect(M + GROUPS.sets, y + 1, 52, 8, { fill: GRAY, stroke: null });
  p.text(L.pointsWon, M + GROUPS.sets + 3, y + 7.5, { size: 6 });
  const pwCols = [190, 212, 234, 256];
  [L.pwServe, L.pwAttack, L.pwBlock, L.pwOpp].forEach((lbl, i) => p.text(lbl, M + pwCols[i], y + 7.5, { size: 6, align: 'center' }));
  y += 12;
  for (let set = 1; set <= 5; set++) {
    const base = y + perSetH - 2;
    p.text(L.setN(set), M + 172, base, { size: 6, align: 'right' });
    const played = d.report.sets[set - 1];
    if (played) {
      const pw = rep.pointsWon[set] ?? { serve: 0, attack: 0, block: 0, opponentErrors: 0 };
      [pw.serve, pw.attack, pw.block, pw.opponentErrors].forEach((v, i) => p.text(dot(v), M + pwCols[i], base, { size: 6.5, align: 'center' }));
      drawValues(p, lineValues(rep.perSet[set] ?? emptyReportLine(), false), base, 6.5);
    }
    y += perSetH;
  }
  // Entrenadors
  p.text(`${L.coach}: ${team.coach ?? ''}`, M + 4, bTop + 26, { size: 7.5, maxWidth: GROUPS.sets - 8 });
  p.text(`${L.assistant}: ${team.assistant ?? ''}`, M + 4, bTop + 40, { size: 7.5, maxWidth: GROUPS.sets - 8 });

  const bottom = y + 4;
  // Vores i separadors
  p.rect(M, top, W, bottom - top, { stroke: '#000000', width: 0.8 });
  for (const x of [GROUPS.serve, GROUPS.reception, GROUPS.attack, GROUPS.block]) p.line(M + x, top, M + x, bottom, { width: 0.5 });
  p.line(M + GROUPS.points, top, M + GROUPS.points, bTop, { width: 0.5 });
  p.line(M + GROUPS.sets, top + 26, M + GROUPS.sets, bTop, { width: 0.3 });
  p.line(M + GROUPS.sets, bTop, M + GROUPS.sets, bottom, { width: 0.5 });
  return bottom - top;
}

export function drawMatchReport(doc: PdfDocument, d: MrInput, L: MrLabels) {
  const p = doc.addPage('portrait');
  header(p, d, L);
  const top = 202;
  const footerTop = p.height - 52;
  const gap = 10;
  const avail = (footerTop - top - gap - 6) / 2;
  const h1 = teamSection(p, d, 'H', top, avail, L);
  teamSection(p, d, 'A', top + h1 + gap, avail, L);

  // Peu: aplicació i llegenda
  const W = p.width - 2 * M;
  const ly = footerTop + 10;
  p.text(L.footer, M, ly - 3, { size: 6.5 });
  p.rect(M, ly, W, 26, { stroke: '#000000', width: 0.6 });
  p.text(L.legend, M + 4, ly + 9.5, { size: 6.3, maxWidth: W - 8 });
  let x = M + 4;
  const item = (draw: () => void, text: string) => {
    draw();
    p.text(text, x + 16, ly + 21, { size: 6.3 });
    x += 16 + p.textWidthOf(text, 6.3) + 14;
  };
  item(() => participationBox(p, x, ly + 22, { kind: 'start', position: 1 }, 12), L.legendStarter);
  item(() => participationBox(p, x, ly + 22, { kind: 'start', position: 1, setter: true }, 12), L.legendSetter);
  item(() => participationBox(p, x, ly + 22, { kind: 'sub' }, 12), L.legendSub);
  item(() => p.circle(x + 6, ly + 19, 4.2, { width: 0.5 }), L.legendServe);
}
