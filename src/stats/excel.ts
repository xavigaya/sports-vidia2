// Exportació d'estadístiques i accions a Excel
import type { TFunction } from 'i18next';
import { applyEvent, initialState, type MatchEvent, type MatchRules, type Side } from '../engine/match';
import { actionCode } from '../engine/actions';
import { eventCode } from '../engine/commands';
import { downloadXlsx, type Cell, type Sheet } from '../lib/excel';
import { safeFilename } from '../lib/csv';
import { kpis, pct, type TeamStats } from './compute';
import type { PlayerRow } from './StatsTables';

const P = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 10); // percentatge amb un decimal

export function playersSheet(t: TFunction, name: string, rows: PlayerRow[], total: PlayerRow, withMatches = false): Sheet {
  const head1: Cell[] = [
    '', '', ...(withMatches ? [''] : []),
    t('stats.total'), '',
    t('skills.S'), '', '', '',
    t('skills.R'), '', '', '',
    t('skills.A'), '', '', '', '', '',
    t('skills.B'), t('skills.E'), t('skills.D'), '', t('skills.F'),
  ];
  const head2: Cell[] = [
    t('players.number'), t('players.firstName'), ...(withMatches ? [t('stats.matchesShort')] : []),
    t('stats.pts'), t('stats.err'),
    t('stats.tot'), '#', '=', `${t('stats.eff')} %`,
    t('stats.tot'), `${t('stats.pos')} %`, `${t('stats.perf')} %`, '=',
    t('stats.tot'), '#', '=', '/', `${t('stats.kill')}`, `${t('stats.eff')} %`,
    '#', t('stats.tot'), t('stats.tot'), `${t('stats.pos')} %`, t('stats.tot'),
  ];
  const line = (r: PlayerRow): Cell[] => {
    const k = kpis(r.line.skills);
    return [
      r.number, r.name, ...(withMatches ? [r.matches ?? null] : []),
      k.points, k.errors,
      k.serve.total, k.serve.aces, k.serve.errors, P(k.serve.eff),
      k.reception.total, P(k.reception.pos), P(k.reception.perfect), k.reception.errors,
      k.attack.total, k.attack.kills, k.attack.errors, k.attack.blocked, P(k.attack.kill), P(k.attack.eff),
      k.block.points, k.set.total, k.dig.total, P(k.dig.pos), k.freeball.total,
    ];
  };
  return {
    name,
    rows: [head1, head2, ...rows.map(line), line(total)],
    widths: [6, 24, ...(withMatches ? [5] : []), ...Array(22).fill(7)],
  };
}

export function teamSummaryRows(t: TFunction, name: string, team: TeamStats): Cell[][] {
  const k = kpis(team.skills);
  const p = team.points;
  return [
    [name],
    [t('stats.pointsWon'), p.total],
    [t('stats.ptsServe'), p.serve],
    [t('stats.ptsAttack'), p.attack],
    [t('stats.ptsBlock'), p.block],
    [t('stats.ptsOppErrors'), p.opponentErrors],
    [t('stats.ptsTeamErrors'), p.teamErrors],
    [t('stats.ptsOther'), p.other],
    [`${t('stats.sideOut')} %`, P(pct(team.sideOut.won, team.sideOut.total)), `${team.sideOut.won}/${team.sideOut.total}`],
    [`${t('stats.breakPoint')} %`, P(pct(team.breakPoint.won, team.breakPoint.total)), `${team.breakPoint.won}/${team.breakPoint.total}`],
    [`${t('stats.attackKill')}`, P(k.attack.kill)],
    [`${t('stats.receptionPos')} %`, P(k.reception.pos)],
    [`${t('stats.serveEff')} %`, P(k.serve.eff)],
    [],
  ];
}

export function rotationsSheet(t: TFunction, teams: { name: string; team: TeamStats }[]): Sheet {
  const rows: Cell[][] = [];
  for (const { name, team } of teams) {
    rows.push([name], [t('stats.rotation'), `${t('stats.sideOut')} %`, t('stats.sideOut'), `${t('stats.breakPoint')} %`, t('stats.breakPoint')]);
    const labels = Object.keys(team.rotations).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const l of labels) {
      const r = team.rotations[l];
      rows.push([
        l,
        P(pct(r.sideOut.won, r.sideOut.total)),
        `${r.sideOut.won}/${r.sideOut.total}`,
        P(pct(r.breakPoint.won, r.breakPoint.total)),
        `${r.breakPoint.won}/${r.breakPoint.total}`,
      ]);
    }
    rows.push([]);
  }
  return { name: t('stats.rotations'), rows, widths: [10, 12, 10, 12, 10] };
}

// Totes les accions del partit, una per fila
export function actionsSheet(
  t: TFunction,
  events: MatchEvent[],
  rules: MatchRules,
  teamNames: Record<Side, string>,
  playerName: (side: Side, n: number) => string,
): Sheet {
  const rows: Cell[][] = [
    ['#', t('clips.set'), t('excel.scoreBefore'), t('clips.team'), t('players.number'), t('players.firstName'), t('stats.skill'), t('excel.type'), t('excel.evaluation'), t('stats.zoneStart'), t('stats.zoneEnd'), t('excel.videoTime'), t('excel.code')],
  ];
  let s = initialState(rules);
  for (const ev of events) {
    const before = s;
    try {
      s = applyEvent(s, ev);
    } catch {
      continue;
    }
    const set = ev.type === 'lineup' ? s.currentSet : before.currentSet;
    const score = `${before.score.H}-${before.score.A}`;
    if (ev.type === 'action') {
      rows.push([
        ev.seq, set, score, teamNames[ev.side], ev.player, playerName(ev.side, ev.player), t(`skills.${ev.skill}`),
        ev.skillType ?? '', ev.evaluation, ev.startZone ?? null, ev.endZone ?? null,
        ev.videoTime != null ? Math.round(ev.videoTime * 10) / 10 : null, actionCode(ev),
      ]);
    } else {
      rows.push([ev.seq, set, score, 'side' in ev ? teamNames[ev.side] : '', null, '', t(`excel.event.${ev.type}`), '', '', null, null,
        ev.videoTime != null ? Math.round(ev.videoTime * 10) / 10 : null, eventCode(ev)]);
    }
  }
  return { name: t('excel.actions'), rows, widths: [6, 5, 8, 18, 6, 22, 14, 6, 6, 6, 6, 8, 16] };
}

export async function downloadStatsWorkbook(filename: string, sheets: Sheet[]) {
  await downloadXlsx(safeFilename(filename), sheets);
}
