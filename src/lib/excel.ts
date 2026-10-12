// Excel (.xlsx) amb SheetJS. La biblioteca es carrega només quan cal.
export type Cell = string | number | boolean | null | undefined;
export interface Sheet {
  name: string;
  rows: Cell[][];
  widths?: number[];
}

// Els noms de full d'Excel: màxim 31 caràcters, sense []:*?/\ i únics
export function sheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Full';
  let n = 2;
  let out = base;
  while (used.has(out.toLowerCase())) {
    const suffix = ` (${n++})`;
    out = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(out.toLowerCase());
  base = out;
  return base;
}

export async function downloadXlsx(filename: string, sheets: Sheet[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows.map((r) => r.map((c) => (c === undefined ? null : c))));
    if (s.widths) ws['!cols'] = s.widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName(s.name, used));
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, { compression: true });
}

// Primer full d'un fitxer Excel com a files de text
export async function readFirstSheet(file: File): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[first], { header: 1, raw: false, defval: '' });
  return rows.map((r) => r.map((c) => (c == null ? '' : String(c))));
}

export function isExcelFile(name: string): boolean {
  return /\.(xlsx|xlsm|xls|ods)$/i.test(name);
}
