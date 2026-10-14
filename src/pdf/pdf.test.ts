import { describe, expect, test } from 'vitest';
import { PdfDocument, fitText, textWidth } from './pdf';

describe('generador de PDF', () => {
  test('estructura vàlida: taula de referències amb els desplaçaments correctes', () => {
    const doc = new PdfDocument({ title: 'Prova' });
    const p = doc.addPage();
    p.text('Col·locació àéíòúç (parèntesis) \\ €', 40, 40, { bold: true });
    p.rect(10, 10, 50, 20, { fill: '#cccccc' });
    p.circle(100, 100, 5);
    doc.addPage('landscape').line(0, 0, 100, 100);
    const s = doc.toString();
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    // Cada entrada de la xref apunta a l'inici de "n 0 obj"
    const xrefAt = Number(/startxref\n(\d+)/.exec(s)![1]);
    const lines = s.slice(xrefAt).split('\n');
    const count = Number(lines[1].split(' ')[1]);
    for (let i = 1; i < count; i++) {
      const off = Number(lines[2 + i].slice(0, 10));
      expect(s.slice(off, off + 12)).toMatch(new RegExp(`^${i} 0 obj`));
    }
    // Text amb escapes: parèntesis i caràcters WinAnsi en octal
    expect(s).toContain('\\(par\\350ntesis\\)');
    expect(s).toContain('Col\\267locaci\\363');
    expect(s).toContain('\\200'); // €
    expect(s).toContain('/Count 2');
    expect(doc.toBytes().length).toBe(s.length);
  });

  test('amplades de text i retallat', () => {
    expect(textWidth('AAAA', 10)).toBeCloseTo(4 * 6.67, 1);
    expect(textWidth('A', 10, true)).toBeCloseTo(7.22, 1);
    const cut = fitText('Un nom molt llarg de jugadora', 9, false, 50);
    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut, 9)).toBeLessThanOrEqual(50);
    expect(fitText('Curt', 9, false, 50)).toBe('Curt');
  });
});
