// =====================================================================
// Gràfica de teranyina (radar) del rendiment d'un equip
//
// 8 eixos, tots en una escala de 0 a 100 on "més lluny del centre" és
// millor. Cada valor real es converteix linealment entre un mínim (0) i un
// màxim (100) de referència i es retalla als extrems.
// =====================================================================
import { kpis, pct, type TeamStats } from './compute';

export type RadarKey = 'serve' | 'reception' | 'attackKill' | 'attackEff' | 'block' | 'defense' | 'sideOut' | 'breakPoint';

interface AxisDef {
  key: RadarKey;
  min: number;
  max: number;
  kind: 'pct' | 'num';
}

export const RADAR_AXES: AxisDef[] = [
  { key: 'serve', min: -0.25, max: 0.25, kind: 'pct' }, // (aces − errors) / serveis
  { key: 'reception', min: 0, max: 0.8, kind: 'pct' }, // recepció positiva (# +)
  { key: 'attackKill', min: 0, max: 0.6, kind: 'pct' }, // punts d'atac / atacs
  { key: 'attackEff', min: -0.2, max: 0.5, kind: 'pct' }, // (punts − errors − bloquejats) / atacs
  { key: 'block', min: 0, max: 4, kind: 'num' }, // punts de bloqueig per set
  { key: 'defense', min: 0, max: 0.8, kind: 'pct' }, // defenses positives (# +)
  { key: 'sideOut', min: 0.3, max: 0.8, kind: 'pct' }, // punts guanyats rebent
  { key: 'breakPoint', min: 0.1, max: 0.6, kind: 'pct' }, // punts guanyats servint
];

export interface RadarValue {
  key: RadarKey;
  value: number | null; // valor real
  score: number | null; // 0..1
  display: string;
}

export function radarValues(team: TeamStats, sets: number): RadarValue[] {
  const k = kpis(team.skills);
  const raw: Record<RadarKey, number | null> = {
    serve: k.serve.eff,
    reception: k.reception.pos,
    attackKill: k.attack.kill,
    attackEff: k.attack.eff,
    block: sets > 0 ? k.block.points / sets : null,
    defense: k.dig.pos,
    sideOut: pct(team.sideOut.won, team.sideOut.total),
    breakPoint: pct(team.breakPoint.won, team.breakPoint.total),
  };
  return RADAR_AXES.map((a) => {
    const value = raw[a.key];
    const score = value == null ? null : Math.max(0, Math.min(1, (value - a.min) / (a.max - a.min)));
    const display = value == null ? '–' : a.kind === 'pct' ? `${Math.round(value * 100)}%` : value.toFixed(1);
    return { key: a.key, value, score, display };
  });
}

// Punts del polígon (angle 0 = amunt, en sentit horari)
export function radarPoint(i: number, n: number, r: number): { x: number; y: number } {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

export function rangeText(a: AxisDef): string {
  return a.kind === 'pct' ? `${Math.round(a.min * 100)}% – ${Math.round(a.max * 100)}%` : `${a.min} – ${a.max}`;
}
