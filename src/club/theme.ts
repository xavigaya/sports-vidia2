import type { Club } from '../lib/types';

const DEFAULT_PRIMARY = '#0b5cab';
const DEFAULT_SECONDARY = '#f2b705';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Luminància relativa (WCAG) per triar text blanc o negre sobre el color del club
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastText(hex: string): string {
  return luminance(hex) > 0.4 ? '#111418' : '#ffffff';
}

export function applyClubTheme(club: Club | null) {
  const primary = club?.primary_color ?? DEFAULT_PRIMARY;
  const secondary = club?.secondary_color ?? DEFAULT_SECONDARY;
  const root = document.documentElement.style;
  root.setProperty('--brand', primary);
  root.setProperty('--brand-contrast', contrastText(primary));
  root.setProperty('--accent', secondary);
  root.setProperty('--accent-contrast', contrastText(secondary));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', primary);
}
