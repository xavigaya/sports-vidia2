// PDF "Estadístiques generals" (format semblant al de Click&Scout):
// una pàgina horitzontal per equip amb els recomptes de cada valoració
// per a servei, recepció, atac i bloqueig, #% i *E%.
import type { SkillCounts } from '../stats/compute';
import { PdfDocument, type PdfPage } from '../pdf/pdf';
import { GS_EVALS, GS_FORMULAS, GS_SKILLS, gsEfficiency, gsPct, gsPerfect, type GsSkill } from './reportData';

export interface GsRow {
  label: string;
  skills: SkillCounts;
}

export interface GsTeam {
  name: string;
  rows: GsRow[];
  total: SkillCounts;
}

export interface GsHeader {
  // Partit: dos equips amb el resultat; acumulat: només el títol de l'equip
  home?: string;
  away?: string;
  sets?: { h: number; a: number }[];
  setsWon?: { h: number; a: number };
  lines: string[]; // data, hora, competició, fase, lloc… (fins a 4)
}

export interface GsLabels {
  title: string;
  skills: Record<GsSkill, string>;
  total: string; // "Tot"
  team: string; // fila de l'equip
  footer: string;
  page: (n: number, total: number) => string;
}

const GRAY = '#dcdcdc';
const LIGHT = '#f2f2f2';
const M = 22; // marge

function header(p: PdfPage, h: GsHeader, L: GsLabels) {
  p.text(L.title, M + 92, 46, { size: 16, align: 'center' });
  p.line(M, 56, M + 290, 56, { width: 1 });
  const x = M + 300;
  const w = p.width - M - x;
  p.rect(x, 26, w, 32, { fill: GRAY, stroke: '#000000' });
  if (h.home != null && h.away != null) {
    p.text(h.home, x + 6, 38, { size: 9, maxWidth: 150 });
    p.text(h.away, x + 6, 52, { size: 9, maxWidth: 150 });
    // Sets guanyats ‖ punts de cada set ‖ total
    const sets = h.sets ?? [];
    const cols: { h: string; a: string; w: number; thick?: boolean }[] = [
      { h: String(h.setsWon?.h ?? ''), a: String(h.setsWon?.a ?? ''), w: 14, thick: true },
      ...[0, 1, 2, 3, 4].map((i) => ({ h: sets[i] ? String(sets[i].h) : '', a: sets[i] ? String(sets[i].a) : '', w: 17, thick: i === 4 })),
      { h: String(sets.reduce((n, s) => n + s.h, 0)), a: String(sets.reduce((n, s) => n + s.a, 0)), w: 24 },
    ];
    let cx = x + 168;
    p.line(cx, 44, cx + cols.reduce((n, c) => n + c.w, 0), 44, { width: 0.8 });
    for (const c of cols) {
      p.text(c.h, cx + c.w / 2, 41, { size: 8, align: 'center' });
      p.text(c.a, cx + c.w / 2, 54, { size: 8, align: 'center' });
      cx += c.w;
      if (c.thick) p.line(cx, 30, cx, 56, { width: 1.4 });
      else if (c !== cols[cols.length - 1]) p.line(cx, 32, cx, 56, { width: 0.3 });
    }
    const info = x + 305;
    const iw = (w - 305 - 4) / 2;
    h.lines.slice(0, 4).forEach((l, i) => p.text(l, info + (i % 2) * iw, 40 + Math.floor(i / 2) * 14, { size: 9, maxWidth: iw - 6 }));
  } else {
    h.lines.slice(0, 4).forEach((l, i) => p.text(l, x + 8 + (i % 2) * 230, 40 + Math.floor(i / 2) * 14, { size: 9, maxWidth: 225 }));
  }
}

export function drawGeneralStats(doc: PdfDocument, h: GsHeader, teams: GsTeam[], L: GsLabels) {
  // Mides de la taula
  const nameW = 150;
  const groupW = (842 - 2 * M - nameW) / 4;
  const colW = [18, 15, 15, 15, 15, 15, 15, 0, 0];
  colW[7] = (groupW - colW.slice(0, 7).reduce((a, b) => a + b, 0)) / 2;
  colW[8] = colW[7];
  const heads = [L.total, ...GS_EVALS, '#%', '*E%'];

  const pages: { team: GsTeam; rows: GsRow[]; first: boolean }[] = [];
  const perPage = 24;
  for (const team of teams) {
    for (let i = 0; i === 0 || i < team.rows.length; i += perPage) {
      pages.push({ team, rows: team.rows.slice(i, i + perPage), first: i === 0 });
    }
  }

  pages.forEach((pg, pageIdx) => {
    const p = doc.addPage('landscape');
    header(p, h, L);
    p.text(pg.team.name, p.width / 2, 96, { size: 14, align: 'center' });

    const top = 108;
    const x0 = M + nameW;
    const tableW = p.width - 2 * M;
    // Capçalera de la taula
    p.rect(M, top, tableW, 28, { fill: GRAY, stroke: '#000000' });
    GS_SKILLS.forEach((sk, g) => {
      const gx = x0 + g * groupW;
      p.line(gx, top, gx, top + 28, { width: 0.8 });
      p.text(L.skills[sk], gx + groupW / 2, top + 12, { size: 10, align: 'center' });
      let cx = gx;
      heads.forEach((hd, i) => {
        p.text(hd, cx + colW[i] / 2, top + 24, { size: 7.5, align: 'center' });
        cx += colW[i];
      });
    });

    const rows: { label: string; skills: SkillCounts; team?: boolean }[] = [
      ...(pg.first ? [{ label: L.team, skills: pg.team.total, team: true }] : []),
      ...pg.rows,
    ];
    const available = p.height - top - 28 - 70;
    const rowH = Math.max(14, Math.min(30, available / Math.max(rows.length, 1)));
    let y = top + 28;
    for (const r of rows) {
      const hgt = r.team ? 18 : rowH;
      if (r.team) p.rect(M, y, tableW, hgt, { fill: LIGHT, stroke: null });
      p.text(r.label, M + 4, y + hgt / 2 + 3, { size: 8, bold: !!r.team, maxWidth: nameW - 8 });
      GS_SKILLS.forEach((sk, g) => {
        const c = r.skills[sk];
        if (c.total === 0) return;
        let cx = x0 + g * groupW;
        const vals = [
          String(c.total),
          ...GS_EVALS.map((e) => (c[e] ? String(c[e]) : '')),
          gsPct(gsPerfect(c)),
          gsPct(gsEfficiency(sk, c)),
        ];
        vals.forEach((v, i) => {
          if (v) p.text(v, i === 0 ? cx + 3 : cx + colW[i] / 2, y + hgt / 2 + 3, { size: 7.5, align: i === 0 ? 'left' : 'center', bold: !!r.team && i > 6 });
          cx += colW[i];
        });
      });
      y += hgt;
      p.line(M, y, M + tableW, y, { width: r.team ? 1.2 : 0.8 });
    }
    // Línies verticals i vora
    p.rect(M, top, tableW, y - top, { stroke: '#000000', width: 0.8 });
    p.line(x0, top, x0, y, { width: 0.8 });
    GS_SKILLS.forEach((_, g) => p.line(x0 + g * groupW, top, x0 + g * groupW, y, { width: 0.8 }));
    // Fórmules
    p.rect(M, y, tableW, 14, { fill: GRAY, stroke: '#000000', width: 0.8 });
    GS_SKILLS.forEach((sk, g) => p.text(`*E% = ${GS_FORMULAS[sk]}`, x0 + g * groupW + groupW / 2, y + 10, { size: 7, align: 'center' }));

    // Peu
    p.line(M, p.height - 34, p.width - M, p.height - 34, { width: 1 });
    p.text(L.footer, M, p.height - 20, { size: 7 });
    p.text(L.page(pageIdx + 1, pages.length), p.width - M, p.height - 20, { size: 7, align: 'right' });
  });
}
