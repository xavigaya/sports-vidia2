// Gràfica de teranyina a la pantalla (SVG), amb una o dues sèries i la taula de valors
import { useTranslation } from 'react-i18next';
import { RADAR_AXES, radarPoint, rangeText, type RadarValue } from './radar';

export interface RadarSeries {
  name: string;
  color: string;
  values: RadarValue[];
}

export function RadarChart({ series }: { series: RadarSeries[] }) {
  const { t } = useTranslation();
  const n = RADAR_AXES.length;
  const R = 110;
  const size = 360;
  const c = size / 2;
  const ring = (f: number) =>
    RADAR_AXES.map((_, i) => radarPoint(i, n, R * f))
      .map((p) => `${c + p.x},${c + p.y}`)
      .join(' ');

  return (
    <div className="radar">
      <svg viewBox={`0 0 ${size} ${size}`} className="radar-svg" role="img" aria-label={t('radar.title')}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={ring(f)} className="radar-ring" />
        ))}
        {RADAR_AXES.map((a, i) => {
          const p = radarPoint(i, n, R);
          const l = radarPoint(i, n, R + 22);
          const anchor = Math.abs(l.x) < 4 ? 'middle' : l.x > 0 ? 'start' : 'end';
          return (
            <g key={a.key}>
              <line x1={c} y1={c} x2={c + p.x} y2={c + p.y} className="radar-axis" />
              <text x={c + l.x} y={c + l.y} textAnchor={anchor} dominantBaseline="middle" className="radar-label">
                {t(`radar.${a.key}`)}
              </text>
            </g>
          );
        })}
        {series.map((s) => {
          const pts = s.values.map((v, i) => radarPoint(i, n, R * (v.score ?? 0)));
          return (
            <g key={s.name}>
              <polygon
                points={pts.map((p) => `${c + p.x},${c + p.y}`).join(' ')}
                fill={s.color}
                fillOpacity={0.18}
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {pts.map((p, i) => (
                <circle key={i} cx={c + p.x} cy={c + p.y} r={4} fill={s.color}>
                  <title>{`${s.name} · ${t(`radar.${RADAR_AXES[i].key}`)}: ${s.values[i].display}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <table className="table radar-table">
        <thead>
          <tr>
            <th />
            {series.map((s) => (
              <th key={s.name} className="num-cell">
                <span className="swatch-dot" style={{ background: s.color }} /> {s.name}
              </th>
            ))}
            <th className="num-cell muted small">{t('radar.scale')}</th>
          </tr>
        </thead>
        <tbody>
          {RADAR_AXES.map((a, i) => (
            <tr key={a.key}>
              <td title={t(`radar.${a.key}Help`)}>{t(`radar.${a.key}`)}</td>
              {series.map((s) => (
                <td key={s.name} className="num-cell strong">
                  {s.values[i].display}
                </td>
              ))}
              <td className="num-cell muted small">{rangeText(a)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
