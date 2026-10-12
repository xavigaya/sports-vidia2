// Llibre Excel d'un partit: resum, jugadors dels dos equips, rotacions i accions
import type { TFunction } from 'i18next';
import type { Side } from '../engine/match';
import type { UseMatch } from '../matches/useMatch';
import { rulesOf } from '../matches/useMatch';
import { playerDisplayName } from '../lib/types';
import { computeMatchStats, emptyLine } from './compute';
import { actionsSheet, downloadStatsWorkbook, playersSheet, rotationsSheet, teamSummaryRows } from './excel';
import type { PlayerRow } from './StatsTables';

export async function exportMatchExcel(m: UseMatch, t: TFunction) {
  const match = m.match!;
  const rules = rulesOf(match);
  const setters = {
    H: m.players.filter((p) => p.side === 'H' && p.position === 'S').map((p) => p.shirt_number),
    A: m.players.filter((p) => p.side === 'A' && p.position === 'S').map((p) => p.shirt_number),
  };
  const st = computeMatchStats(m.events, rules, { setters });
  const names: Record<Side, string> = { H: match.home.name, A: match.away.name };
  const playerName = (side: Side, n: number) => {
    const p = m.players.find((x) => x.side === side && x.shirt_number === n);
    return p ? playerDisplayName(p.players) : '';
  };
  const rows = (side: Side): PlayerRow[] =>
    Object.keys(st.players[side])
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => ({ key: String(n), number: n, name: playerName(side, n), line: st.players[side][n] ?? emptyLine() }));

  const date = match.played_at ? new Date(match.played_at).toLocaleString() : '';
  const summary = [
    [`${names.H} – ${names.A}`],
    [t('matches.date'), date],
    [t('matches.competition'), match.competition ?? ''],
    [t('matches.phase'), match.phase ?? ''],
    [t('excel.result'), `${m.state?.setsWon.H ?? 0}-${m.state?.setsWon.A ?? 0}`],
    ...(m.state?.sets ?? []).map((s) => [t('live.setN', { n: s.number }), `${s.home}-${s.away}`]),
    [],
    ...teamSummaryRows(t, names.H, st.teams.H),
    ...teamSummaryRows(t, names.A, st.teams.A),
  ];
  const day = match.played_at ? match.played_at.slice(0, 10) : 'partit';
  await downloadStatsWorkbook(`${day} ${names.H}-${names.A}`, [
    { name: t('excel.summary'), rows: summary, widths: [26, 14, 10] },
    playersSheet(t, names.H, rows('H'), { key: 't', number: null, name: t('stats.teamTotal'), line: st.teams.H }),
    playersSheet(t, names.A, rows('A'), { key: 't', number: null, name: t('stats.teamTotal'), line: st.teams.A }),
    rotationsSheet(t, [
      { name: names.H, team: st.teams.H },
      { name: names.A, team: st.teams.A },
    ]),
    actionsSheet(t, m.events, rules, names, playerName),
  ]);
}
