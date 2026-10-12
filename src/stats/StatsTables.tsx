// Components de presentació d'estadístiques (compartits entre un partit i l'acumulat)
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Evaluation, Skill } from '../engine/actions';
import { kpis, pct, type EvalCounts, type Line, type Ratio, type TeamStats, type ZoneCounts } from './compute';

export const fmtPct = (v: number | null) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const ratioPct = (r: Ratio) => fmtPct(pct(r.won, r.total));

export interface PlayerRow {
  key: string;
  number: number | null;
  name: string;
  line: Line;
  matches?: number;
}

// Cel·la numèrica; si hi ha callback i valor, és clicable (obre els vídeos filtrats)
function N({ v, onClick, title }: { v: number | string; onClick?: () => void; title?: string }) {
  if (onClick && typeof v === 'number' && v > 0) {
    return (
      <td className="num-cell">
        <button className="cell-link" onClick={onClick} title={title}>
          {v}
        </button>
      </td>
    );
  }
  return <td className="num-cell">{v === 0 ? <span className="zero">0</span> : v}</td>;
}

export type CellClick = (row: PlayerRow, skill: Skill, evaluations: Evaluation[]) => void;

export function PlayerTable({ rows, total, onCell, showMatches }: { rows: PlayerRow[]; total: PlayerRow; onCell?: CellClick; showMatches?: boolean }) {
  const { t } = useTranslation();
  const tip = t('stats.showClips');
  const line = (r: PlayerRow, isTotal = false) => {
    const k = kpis(r.line.skills);
    const c = onCell && !isTotal ? (skill: Skill, ev: Evaluation[] = []) => () => onCell(r, skill, ev) : () => undefined;
    const cc = onCell && !isTotal;
    return (
      <tr key={r.key} className={isTotal ? 'total-row' : ''}>
        <td className="mono num-cell">{r.number ?? ''}</td>
        <td className="name-cell">{r.name}</td>
        {showMatches && <td className="num-cell">{r.matches ?? ''}</td>}
        <td className="num-cell strong">{k.points}</td>
        <td className="num-cell">{k.errors}</td>
        <N v={k.serve.total} onClick={cc ? c('S') : undefined} title={tip} />
        <N v={k.serve.aces} onClick={cc ? c('S', ['#']) : undefined} title={tip} />
        <N v={k.serve.errors} onClick={cc ? c('S', ['=']) : undefined} title={tip} />
        <td className="num-cell">{fmtPct(k.serve.eff)}</td>
        <N v={k.reception.total} onClick={cc ? c('R') : undefined} title={tip} />
        <td className="num-cell">{fmtPct(k.reception.pos)}</td>
        <td className="num-cell">{fmtPct(k.reception.perfect)}</td>
        <N v={k.reception.errors} onClick={cc ? c('R', ['=']) : undefined} title={tip} />
        <N v={k.attack.total} onClick={cc ? c('A') : undefined} title={tip} />
        <N v={k.attack.kills} onClick={cc ? c('A', ['#']) : undefined} title={tip} />
        <N v={k.attack.errors} onClick={cc ? c('A', ['=']) : undefined} title={tip} />
        <N v={k.attack.blocked} onClick={cc ? c('A', ['/']) : undefined} title={tip} />
        <td className="num-cell">{fmtPct(k.attack.kill)}</td>
        <td className="num-cell">{fmtPct(k.attack.eff)}</td>
        <N v={k.block.points} onClick={cc ? c('B', ['#']) : undefined} title={tip} />
        <N v={k.set.total} onClick={cc ? c('E') : undefined} title={tip} />
        <N v={k.dig.total} onClick={cc ? c('D') : undefined} title={tip} />
        <td className="num-cell">{fmtPct(k.dig.pos)}</td>
        <N v={k.freeball.total} onClick={cc ? c('F') : undefined} title={tip} />
      </tr>
    );
  };

  return (
    <div className="table-scroll">
      <table className="table stats-table">
        <thead>
          <tr className="group-row">
            <th colSpan={showMatches ? 3 : 2} />
            <th colSpan={2}>{t('stats.total')}</th>
            <th colSpan={4}>{t('skills.S')}</th>
            <th colSpan={4}>{t('skills.R')}</th>
            <th colSpan={6}>{t('skills.A')}</th>
            <th>{t('skills.B')}</th>
            <th>{t('skills.E')}</th>
            <th colSpan={2}>{t('skills.D')}</th>
            <th>{t('stats.fbShort')}</th>
          </tr>
          <tr>
            <th className="num-cell">{t('players.number')}</th>
            <th>{t('players.firstName')}</th>
            {showMatches && <th className="num-cell" title={t('stats.matchesPlayed')}>{t('stats.matchesShort')}</th>}
            <th className="num-cell" title={t('stats.pointsHelp')}>{t('stats.pts')}</th>
            <th className="num-cell" title={t('stats.errorsHelp')}>{t('stats.err')}</th>
            <th className="num-cell">{t('stats.tot')}</th>
            <th className="num-cell" title={t('evals.S.perfect')}>#</th>
            <th className="num-cell" title={t('evals.S.error')}>=</th>
            <th className="num-cell" title={t('stats.serveEffHelp')}>{t('stats.eff')}</th>
            <th className="num-cell">{t('stats.tot')}</th>
            <th className="num-cell" title={t('stats.posHelp')}>{t('stats.pos')}</th>
            <th className="num-cell" title={t('stats.perfHelp')}>{t('stats.perf')}</th>
            <th className="num-cell">=</th>
            <th className="num-cell">{t('stats.tot')}</th>
            <th className="num-cell">#</th>
            <th className="num-cell">=</th>
            <th className="num-cell" title={t('evals.A.poor')}>/</th>
            <th className="num-cell" title={t('stats.killHelp')}>{t('stats.kill')}</th>
            <th className="num-cell" title={t('stats.attackEffHelp')}>{t('stats.eff')}</th>
            <th className="num-cell">#</th>
            <th className="num-cell">{t('stats.tot')}</th>
            <th className="num-cell">{t('stats.tot')}</th>
            <th className="num-cell">{t('stats.pos')}</th>
            <th className="num-cell">{t('stats.tot')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => line(r))}
          {line(total, true)}
        </tbody>
      </table>
    </div>
  );
}

export function TeamSummary({ name, team, color, sets }: { name: string; team: TeamStats; color: string; sets?: string }) {
  const { t } = useTranslation();
  const k = kpis(team.skills);
  const p = team.points;
  return (
    <section className="card team-summary" style={{ ['--team' as string]: color }}>
      <header className="ts-head">
        <h3>{name}</h3>
        {sets && <span className="mono ts-sets">{sets}</span>}
      </header>
      <div className="kpi-grid">
        <Kpi label={t('stats.pointsWon')} value={String(p.total)} />
        <Kpi label={t('stats.sideOut')} value={ratioPct(team.sideOut)} sub={`${team.sideOut.won}/${team.sideOut.total}`} help={t('stats.sideOutHelp')} />
        <Kpi label={t('stats.breakPoint')} value={ratioPct(team.breakPoint)} sub={`${team.breakPoint.won}/${team.breakPoint.total}`} help={t('stats.breakPointHelp')} />
        <Kpi label={t('stats.attackKill')} value={fmtPct(k.attack.kill)} sub={`${k.attack.kills}/${k.attack.total}`} />
        <Kpi label={t('stats.receptionPos')} value={fmtPct(k.reception.pos)} sub={`${k.reception.total}`} />
        <Kpi label={t('stats.serveEff')} value={fmtPct(k.serve.eff)} sub={`${k.serve.aces} # · ${k.serve.errors} =`} />
      </div>
      <table className="table small points-table">
        <tbody>
          <tr>
            <th>{t('stats.ptsServe')}</th>
            <td className="num-cell">{p.serve}</td>
            <th>{t('stats.ptsAttack')}</th>
            <td className="num-cell">{p.attack}</td>
            <th>{t('stats.ptsBlock')}</th>
            <td className="num-cell">{p.block}</td>
          </tr>
          <tr>
            <th>{t('stats.ptsOppErrors')}</th>
            <td className="num-cell">{p.opponentErrors}</td>
            <th>{t('stats.ptsTeamErrors')}</th>
            <td className="num-cell">{p.teamErrors}</td>
            <th>{t('stats.ptsOther')}</th>
            <td className="num-cell">{p.other}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function Kpi({ label, value, sub, help }: { label: string; value: string; sub?: string; help?: string }) {
  return (
    <div className="kpi" title={help}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

export function RotationTable({ team }: { team: TeamStats }) {
  const { t } = useTranslation();
  const labels = Object.keys(team.rotations).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (labels.length === 0) return <p className="muted small">{t('stats.noData')}</p>;
  return (
    <div className="table-scroll">
      <table className="table stats-table rotation-table">
        <thead>
          <tr>
            <th>{t('stats.rotation')}</th>
            <th className="num-cell">{t('stats.sideOut')}</th>
            <th className="num-cell" />
            <th className="num-cell">{t('stats.breakPoint')}</th>
            <th className="num-cell" />
          </tr>
        </thead>
        <tbody>
          {labels.map((l) => {
            const r = team.rotations[l];
            return (
              <tr key={l}>
                <td className="mono">{l}</td>
                <td className="num-cell strong">{ratioPct(r.sideOut)}</td>
                <td className="num-cell muted">
                  {r.sideOut.won}/{r.sideOut.total}
                </td>
                <td className="num-cell strong">{ratioPct(r.breakPoint)}</td>
                <td className="num-cell muted">
                  {r.breakPoint.won}/{r.breakPoint.total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Mapa de zones (vista de l'equip que hi juga: xarxa a dalt)
const GRID = [4, 3, 2, 7, 8, 9, 5, 6, 1];
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf'];

export function ZoneMap({ zones, players }: { zones: (playerKey: string | null) => ZoneCounts; players: { key: string; label: string }[] }) {
  const { t } = useTranslation();
  const [skill, setSkill] = useState<Skill>('A');
  const [kind, setKind] = useState<'start' | 'end'>('end');
  const [who, setWho] = useState<string>('');
  const data = zones(who || null)[skill][kind];
  const total = Object.values(data).reduce((n, c) => n + c.total, 0);
  const max = Math.max(1, ...Object.values(data).map((c) => c.total));

  const cell = (z: number) => {
    const c: EvalCounts | undefined = data[z];
    const n = c?.total ?? 0;
    const level = n === 0 ? -1 : Math.min(RAMP.length - 1, Math.floor((n / max) * (RAMP.length - 1)));
    const bg = level < 0 ? 'transparent' : RAMP[level];
    const dark = level >= 6;
    const tooltip = c
      ? `${t('stats.zone')} ${z}: ${n} (${fmtPct(pct(n, total))}) · # ${c['#']} · = ${c['=']} · / ${c['/']}`
      : `${t('stats.zone')} ${z}: 0`;
    return (
      <div key={z} className={`zm-cell ${dark ? 'dark' : ''}`} style={{ background: bg }} title={tooltip}>
        <span className="zm-zone">{z}</span>
        <span className="zm-n">{n}</span>
        {n > 0 && <span className="zm-pct">{fmtPct(pct(n, total))}</span>}
        {n > 0 && (
          <span className="zm-detail">
            #{c!['#']} ={c!['=']}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="zone-map stack">
      <div className="row wrap">
        <select value={skill} onChange={(e) => setSkill(e.target.value as Skill)} aria-label={t('stats.skill')}>
          {(['S', 'R', 'A', 'D', 'F', 'B', 'E'] as Skill[]).map((s) => (
            <option key={s} value={s}>
              {t(`skills.${s}`)}
            </option>
          ))}
        </select>
        <div className="segmented">
          <button className={kind === 'start' ? 'on' : ''} onClick={() => setKind('start')}>
            {t('stats.zoneStart')}
          </button>
          <button className={kind === 'end' ? 'on' : ''} onClick={() => setKind('end')}>
            {t('stats.zoneEnd')}
          </button>
        </div>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label={t('clips.player')}>
          <option value="">{t('clips.allPlayers')}</option>
          {players.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="zm-court">
        <div className="zm-net">{t('legend.net')}</div>
        <div className="zm-grid">{GRID.map(cell)}</div>
      </div>
      <p className="small muted">
        {t('stats.zoneHelp', { count: total })}
      </p>
    </div>
  );
}
