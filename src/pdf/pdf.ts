// =====================================================================
// Generador de PDF mínim, sense dependències
//
// Prou per als informes d'estadístiques: pàgines A4 (vertical o
// horitzontal), text amb Helvetica / Helvetica-Bold (fonts estàndard que
// tots els lectors de PDF porten, amb accents i ç, l·l…), línies,
// rectangles i cercles. Coordenades en punts (1/72 de polzada) des de
// l'angle superior esquerre; la y del text és la de la línia base.
// =====================================================================

import { HELVETICA, HELVETICA_BOLD, WINANSI_EXTRA } from './fontMetrics';

export type Align = 'left' | 'center' | 'right';

export interface TextOptions {
  size?: number;
  bold?: boolean;
  align?: Align;
  color?: string; // #rrggbb
  maxWidth?: number; // es retalla amb "…" si no hi cap
}

export interface ShapeOptions {
  fill?: string | null;
  stroke?: string | null;
  width?: number;
}

export const A4 = { width: 595.28, height: 841.89 };

// ---------------------------------------------------------------------
// Text: codificació WinAnsi i amplades
// ---------------------------------------------------------------------
function winAnsiCode(ch: string): number {
  const cp = ch.codePointAt(0) ?? 63;
  if (cp < 128) return cp >= 32 ? cp : 32;
  if (cp >= 160 && cp <= 255) return cp;
  return WINANSI_EXTRA[cp] ?? 63; // "?" si no hi és
}

function encode(str: string): number[] {
  // Normalitza: forma composta (à en lloc de a + accent), punt volat de l·l
  const s = str.normalize('NFC').replace(/‧/g, '·').replace(/[−]/g, '-');
  return Array.from(s, winAnsiCode);
}

export function textWidth(str: string, size: number, bold = false): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let w = 0;
  for (const c of encode(str)) w += table[c] || 556;
  return (w * size) / 1000;
}

export function fitText(str: string, size: number, bold: boolean, maxWidth: number): string {
  if (textWidth(str, size, bold) <= maxWidth) return str;
  let s = str;
  while (s.length > 0 && textWidth(`${s}…`, size, bold) > maxWidth) s = s.slice(0, -1);
  return s.length ? `${s.trimEnd()}…` : '';
}

function pdfString(str: string): string {
  let out = '(';
  for (const c of encode(str)) {
    if (c === 40 || c === 41 || c === 92) out += `\\${String.fromCharCode(c)}`;
    else if (c < 128) out += String.fromCharCode(c);
    else out += `\\${c.toString(8).padStart(3, '0')}`;
  }
  return `${out})`;
}

// Text de metadades (títol…) en UTF-16BE
function pdfUnicode(str: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < str.length; i++) hex += str.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

function rgb(color: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (!m) return '0 0 0';
  return [m[1], m[2], m[3]].map((h) => n(parseInt(h, 16) / 255)).join(' ');
}

// ---------------------------------------------------------------------
// Pàgina
// ---------------------------------------------------------------------
export class PdfPage {
  readonly ops: string[] = [];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  textWidthOf(str: string, size: number, bold = false) {
    return textWidth(str, size, bold);
  }

  private Y(y: number) {
    return this.height - y;
  }

  text(str: string, x: number, y: number, o: TextOptions = {}) {
    const size = o.size ?? 9;
    const bold = !!o.bold;
    let s = str;
    if (o.maxWidth != null) s = fitText(s, size, bold, o.maxWidth);
    if (!s) return;
    const w = textWidth(s, size, bold);
    const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${rgb(o.color ?? '#000000')} rg ${n(x0)} ${n(this.Y(y))} Td ${pdfString(s)} Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number, o: { color?: string; width?: number; dash?: number[] } = {}) {
    const dash = o.dash?.length ? `[${o.dash.map(n).join(' ')}] 0 d ` : '';
    this.ops.push(`q ${dash}${n(o.width ?? 0.5)} w ${rgb(o.color ?? '#000000')} RG ${n(x1)} ${n(this.Y(y1))} m ${n(x2)} ${n(this.Y(y2))} l S Q`);
  }

  rect(x: number, y: number, w: number, h: number, o: ShapeOptions = {}) {
    const stroke = o.stroke === undefined ? '#000000' : o.stroke;
    const fill = o.fill ?? null;
    if (!stroke && !fill) return;
    const paint = fill && stroke ? 'B' : fill ? 'f' : 'S';
    const style = `${fill ? `${rgb(fill)} rg ` : ''}${stroke ? `${rgb(stroke)} RG ${n(o.width ?? 0.5)} w ` : ''}`;
    this.ops.push(`q ${style}${n(x)} ${n(this.Y(y + h))} ${n(w)} ${n(h)} re ${paint} Q`);
  }

  circle(cx: number, cy: number, r: number, o: ShapeOptions = {}) {
    const stroke = o.stroke === undefined ? '#000000' : o.stroke;
    const fill = o.fill ?? null;
    if (!stroke && !fill) return;
    const k = 0.5523 * r;
    const y = this.Y(cy);
    const p = (a: number, b: number) => `${n(a)} ${n(b)}`;
    const path = [
      `${p(cx + r, y)} m`,
      `${p(cx + r, y + k)} ${p(cx + k, y + r)} ${p(cx, y + r)} c`,
      `${p(cx - k, y + r)} ${p(cx - r, y + k)} ${p(cx - r, y)} c`,
      `${p(cx - r, y - k)} ${p(cx - k, y - r)} ${p(cx, y - r)} c`,
      `${p(cx + k, y - r)} ${p(cx + r, y - k)} ${p(cx + r, y)} c`,
    ].join(' ');
    const paint = fill && stroke ? 'B' : fill ? 'f' : 'S';
    const style = `${fill ? `${rgb(fill)} rg ` : ''}${stroke ? `${rgb(stroke)} RG ${n(o.width ?? 0.5)} w ` : ''}`;
    this.ops.push(`q ${style}${path} ${paint} Q`);
  }
}

// ---------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------
export class PdfDocument {
  readonly pages: PdfPage[] = [];
  constructor(private meta: { title?: string; author?: string } = {}) {}

  addPage(orientation: 'portrait' | 'landscape' = 'portrait'): PdfPage {
    const p = orientation === 'landscape' ? new PdfPage(A4.height, A4.width) : new PdfPage(A4.width, A4.height);
    this.pages.push(p);
    return p;
  }

  // El fitxer PDF (només caràcters ASCII: el text no ASCII va amb escapes octals)
  toString(): string {
    const objs: string[] = [];
    const add = (body: string) => objs.push(body) && objs.length;
    const catalog = add(''); // es completa al final
    const pagesId = add('');
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids: number[] = [];
    for (const p of this.pages) {
      const content = p.ops.join('\n');
      const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      kids.push(
        add(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(p.width)} ${n(p.height)}] ` +
            `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`,
        ),
      );
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const info = add(
      `<< /Producer (Volei VidIA)${this.meta.title ? ` /Title ${pdfUnicode(this.meta.title)}` : ''}` +
        `${this.meta.author ? ` /Author ${pdfUnicode(this.meta.author)}` : ''} >>`,
    );

    let out = '%PDF-1.4\n%âãÏÓ\n';
    const offsets: number[] = [];
    objs.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return out;
  }

  toBytes(): Uint8Array {
    const s = this.toString();
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    return bytes;
  }

  toBlob(): Blob {
    return new Blob([this.toBytes().buffer as ArrayBuffer], { type: 'application/pdf' });
  }
}
