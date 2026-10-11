// Lectura i escriptura de CSV compatibles amb Excel (separador ";" o ",",
// cometes dobles, UTF-8 amb BOM).

export function detectDelimiter(firstLine: string): string {
  const counts = { ';': 0, ',': 0, '\t': 0 } as Record<string, number>;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ';';
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function quote(v: string, delim: string): string {
  return /["\r\n]/.test(v) || v.includes(delim) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][], delim = ';'): string {
  return (
    '﻿' +
    rows
      .map((r) => r.map((c) => quote(c === null || c === undefined ? '' : typeof c === 'boolean' ? (c ? 'sí' : 'no') : String(c), delim)).join(delim))
      .join('\r\n') +
    '\r\n'
  );
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}

// Normalitza una capçalera o un valor per comparar-lo: minúscules, sense accents ni símbols
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, '');
}

export function parseBool(v: string | undefined): boolean {
  return ['si', 's', 'yes', 'y', '1', 'true', 'x', 'vertader', 'verdadero'].includes(norm(v ?? ''));
}

export function safeFilename(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'export'
  );
}
