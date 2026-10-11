import type { PointerEvent } from 'react';
import type { Point2 } from '../engine/actions';

// Camp sencer (18 × 9 m) per marcar origen i destinació d'una acció.
// Les coordenades es guarden sempre amb el local a l'esquerra; si la
// vista està girada, es dibuixa girat 180°.
interface Props {
  flipped: boolean;
  start: Point2 | null;
  end: Point2 | null;
  onTap?: (p: Point2) => void;
  colors: { left: string; right: string };
}

const M = 2; // marge al voltant del camp (m)

export function CourtMap({ flipped, start, end, onTap, colors }: Props) {
  const toView = (p: Point2): Point2 => (flipped ? { x: 18 - p.x, y: 9 - p.y } : p);

  function handle(e: PointerEvent<SVGSVGElement>) {
    if (!onTap) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const v = pt.matrixTransform(ctm.inverse());
    const p = { x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10 };
    onTap(flipped ? { x: 18 - p.x, y: 9 - p.y } : p);
  }

  const s = start ? toView(start) : null;
  const en = end ? toView(end) : null;

  return (
    <svg
      className="court-map"
      viewBox={`${-M} ${-M} ${18 + 2 * M} ${9 + 2 * M}`}
      onPointerDown={handle}
      role="img"
      aria-label="court"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#111" />
        </marker>
      </defs>
      <rect x={-M} y={-M} width={18 + 2 * M} height={9 + 2 * M} className="cm-out" />
      <rect x={0} y={0} width={9} height={9} fill={colors.left} opacity={0.18} />
      <rect x={9} y={0} width={9} height={9} fill={colors.right} opacity={0.18} />
      <rect x={0} y={0} width={18} height={9} className="cm-court" />
      {/* Zones de 3 m */}
      {[3, 6, 12, 15].map((x) => (
        <line key={`x${x}`} x1={x} y1={0} x2={x} y2={9} className={x === 6 || x === 12 ? 'cm-attack' : 'cm-grid'} />
      ))}
      {[3, 6].map((y) => (
        <line key={`y${y}`} x1={0} y1={y} x2={18} y2={y} className="cm-grid" />
      ))}
      <line x1={9} y1={-0.6} x2={9} y2={9.6} className="cm-net" />
      {/* Números de zona */}
      {ZONE_LABELS.map((z, i) => (
        <text key={i} x={z.x} y={z.y} className="cm-zone">
          {z.n}
        </text>
      ))}
      {s && en && <line x1={s.x} y1={s.y} x2={en.x} y2={en.y} className="cm-traj" markerEnd="url(#arrow)" />}
      {s && <circle cx={s.x} cy={s.y} r={0.35} className="cm-start" />}
      {en && <circle cx={en.x} cy={en.y} r={0.3} className="cm-end" />}
    </svg>
  );
}

// Zones dibuixades en coordenades de vista: equip de l'esquerra i de la dreta
const LEFT = [
  [5, 7, 4],
  [6, 8, 3],
  [1, 9, 2],
];
const ZONE_LABELS: { x: number; y: number; n: number }[] = [];
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    ZONE_LABELS.push({ x: c * 3 + 1.5, y: r * 3 + 1.9, n: LEFT[r][c] });
    // Dreta: mirall (girat 180°)
    ZONE_LABELS.push({ x: 18 - (c * 3 + 1.5), y: 9 - (r * 3 + 1.5) + 0.4, n: LEFT[r][c] });
  }
}
