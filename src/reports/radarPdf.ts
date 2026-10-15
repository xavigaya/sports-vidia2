// Pàgina del PDF amb la gràfica de teranyina dels equips i la taula de valors
import { PdfDocument } from '../pdf/pdf';
import { RADAR_AXES, radarPoint, rangeText, type RadarKey, type RadarValue } from '../stats/radar';

export interface RadarPdfSeries {
  name: string;
  color: string;
  values: RadarValue[];
}

export interface RadarPdfLabels {
  title: string;
  subtitle: string;
  axes: Record<RadarKey, string>;
  help: Record<RadarKey, string>;
  scale: string;
  note: string;
  footer: string;
}

const M = 28;

export function drawRadarPage(doc: PdfDocument, series: RadarPdfSeries[], L: RadarPdfLabels) {
  const p = doc.addPage('portrait');
  p.text(L.title, M, 48, { size: 16 });
  p.text(L.subtitle, M, 66, { size: 10, color: '#444444', maxWidth: p.width - 2 * M });
  p.line(M, 74, p.width - M, 74, { width: 0.8 });

  // Llegenda
  let lx = M;
  for (const s of series) {
    p.rect(lx, 86, 12, 8, { fill: s.color, stroke: null });
    p.text(s.name, lx + 16, 93, { size: 9, bold: true });
    lx += 16 + p.textWidthOf(s.name, 9, true) + 20;
  }

  // Gràfica
  const n = RADAR_AXES.length;
  const cx = p.width / 2;
  const cy = 300;
  const R = 160;
  const at = (i: number, r: number) => {
    const q = radarPoint(i, n, r);
    return { x: cx + q.x, y: cy + q.y };
  };
  for (const f of [0.25, 0.5, 0.75, 1]) {
    p.polygon(
      RADAR_AXES.map((_, i) => at(i, R * f)),
      { stroke: '#bbbbbb', width: f === 1 ? 0.8 : 0.4 },
    );
    p.text(String(Math.round(f * 100)), cx + 3, cy - R * f + 9, { size: 6, color: '#999999' });
  }
  RADAR_AXES.forEach((a, i) => {
    const e = at(i, R);
    p.line(cx, cy, e.x, e.y, { color: '#bbbbbb', width: 0.4 });
    const l = at(i, R + 16);
    const align = Math.abs(l.x - cx) < 4 ? 'center' : l.x > cx ? 'left' : 'right';
    p.text(L.axes[a.key], l.x, l.y + 3, { size: 9, bold: true, align });
  });
  for (const s of series) {
    const pts = s.values.map((v, i) => at(i, R * (v.score ?? 0)));
    p.polygon(pts, { fill: s.color, fillOpacity: 0.2, stroke: s.color, width: 1.6 });
    for (const q of pts) p.circle(q.x, q.y, 2.4, { fill: s.color, stroke: null });
  }

  // Taula de valors
  let y = cy + R + 50;
  const cols = { axis: M, def: M + 120, vals: M + 330, scale: p.width - M };
  const valW = (cols.scale - 80 - cols.vals) / Math.max(series.length, 1);
  p.rect(M, y - 11, p.width - 2 * M, 16, { fill: '#e6e6e6', stroke: null });
  series.forEach((s, j) => p.text(s.name, cols.vals + valW * j + valW / 2, y, { size: 8.5, bold: true, align: 'center', maxWidth: valW - 4 }));
  p.text(L.scale, cols.scale, y, { size: 8, align: 'right', color: '#555555' });
  y += 18;
  RADAR_AXES.forEach((a, i) => {
    p.text(L.axes[a.key], cols.axis, y, { size: 9, bold: true });
    p.text(L.help[a.key], cols.def, y, { size: 7.5, color: '#444444', maxWidth: cols.vals - cols.def - 8 });
    series.forEach((s, j) => p.text(s.values[i].display, cols.vals + valW * j + valW / 2, y, { size: 9, align: 'center' }));
    p.text(rangeText(a), cols.scale, y, { size: 8, align: 'right', color: '#555555' });
    p.line(M, y + 5, p.width - M, y + 5, { color: '#dddddd', width: 0.4 });
    y += 17;
  });
  p.text(L.note, M, y + 10, { size: 7.5, color: '#555555', maxWidth: p.width - 2 * M });

  p.text(L.footer, M, p.height - 24, { size: 6.5 });
}
