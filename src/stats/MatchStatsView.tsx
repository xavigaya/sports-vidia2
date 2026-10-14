import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentClub } from '../club/ClubProvider';
import { playerDisplayName, type SideCode } from '../lib/types';
import type { Side } from '../engine/match';
import type { UseMatch } from '../matches/useMatch';
import { rulesOf } from '../matches/useMatch';
import type { ClipFilter } from '../video/clips';
import { computeMatchStats, emptyLine } from './compute';
import { PlayerTable, RotationTable, TeamSummary, ZoneMap, type PlayerRow } from './StatsTables';
import { GeneralStatsTable } from '../reports/GeneralStatsTable';

export function MatchStatsView({ m, onShowClips }: { m: UseMatch; onShowClips: (f: Partial<ClipFilter>) => void }) {
  const { t } = useTranslation();
  const club = useCurrentClub();
  const match = m.match!;
  const [set, setSet] = useState<number | null>(null);
  const [side, setSide] = useState<Side>(match.home.is_own || !match.away.is_own ? 'H' : 'A');

  const setters = useMemo(
    () => ({
      H: m.players.filter((p) => p.side === 'H' && p.position === 'S').map((p) => p.shirt_number),
      A: m.players.filter((p) => p.side === 'A' && p.position === 'S').map((p) => p.shirt_number),
    }),
    [m.players],
  );
  const stats = useMemo(() => computeMatchStats(m.events, rulesOf(match), { set, setters }), [m.events, match, set, setters]);
  const sets = m.state?.sets ?? [];

  const names: Record<SideCode, string> = { H: match.home.name, A: match.away.name };
  const colors: Record<SideCode, string> = {
    H: match.home.color ?? (match.home.is_own ? club.primary_color : '#5b6575'),
    A: match.away.color ?? (match.away.is_own ? club.primary_color : '#5b6575'),
  };

  const rows: PlayerRow[] = useMemo(() => {
    const roster = m.players.filter((p) => p.side === side);
    const nums = new Set([...roster.map((p) => p.shirt_number), ...Object.keys(stats.players[side]).map(Number)]);
    return [...nums]
      .filter((n) => stats.players[side][n])
      .sort((a, b) => a - b)
      .map((n) => {
        const p = roster.find((x) => x.shirt_number === n);
        return { key: String(n), number: n, name: p ? playerDisplayName(p.players) : '', line: stats.players[side][n] ?? emptyLine() };
      });
  }, [m.players, side, stats]);

  const setScore = (s: Side) =>
    set == null
      ? `${match[s === 'H' ? 'home_sets' : 'away_sets']}`
      : `${sets[set - 1]?.[s === 'H' ? 'home' : 'away'] ?? 0}`;

  if (m.events.filter((e) => e.type === 'action' || e.type === 'point').length === 0) {
    return <div className="card empty">{t('stats.empty')}</div>;
  }

  return (
    <div className="stack match-stats">
      <div className="row wrap">
        <div className="segmented">
          <button className={set == null ? 'on' : ''} onClick={() => setSet(null)}>
            {t('stats.allMatch')}
          </button>
          {sets.map((s) => (
            <button key={s.number} className={set === s.number ? 'on' : ''} onClick={() => setSet(s.number)}>
              {t('live.setN', { n: s.number })}
              <span className="small muted mono"> {s.home}-{s.away}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2 summaries">
        {(['H', 'A'] as Side[]).map((s) => (
          <TeamSummary key={s} name={names[s]} team={stats.teams[s]} color={colors[s]} sets={setScore(s)} />
        ))}
      </div>

      <section className="card stack">
        <div className="row between wrap">
          <h2>{t('stats.players')}</h2>
          <div className="segmented">
            {(['H', 'A'] as Side[]).map((s) => (
              <button key={s} className={side === s ? 'on' : ''} onClick={() => setSide(s)}>
                {names[s]}
              </button>
            ))}
          </div>
        </div>
        <PlayerTable
          rows={rows}
          total={{ key: 'total', number: null, name: t('stats.teamTotal'), line: stats.teams[side] }}
          onCell={(row, skill, evaluations) =>
            onShowClips({ side, player: row.number, skills: [skill], evaluations, set })
          }
        />
        <p className="small muted">{t('stats.clickHelp')}</p>
      </section>

      <section className="card stack">
        <h2>
          {t('report.general')} · {names[side]}
        </h2>
        <GeneralStatsTable
          rows={rows.map((r) => ({ key: r.key, label: `${r.number ?? ''} ${r.name}`.trim(), skills: r.line.skills }))}
          total={stats.teams[side].skills}
        />
        <p className="small muted">{t('report.generalHelp')}</p>
      </section>

      <div className="grid-2">
        <section className="card stack">
          <h2>
            {t('stats.rotations')} · {names[side]}
          </h2>
          <RotationTable team={stats.teams[side]} />
          <p className="small muted">{t('stats.rotationHelp')}</p>
        </section>
        <section className="card stack">
          <h2>
            {t('stats.zones')} · {names[side]}
          </h2>
          <ZoneMap
            key={side}
            zones={(key) => (key ? stats.players[side][Number(key)]?.zones ?? emptyLine().zones : stats.teams[side].zones)}
            players={rows.map((r) => ({ key: r.key, label: `${r.number} · ${r.name}` }))}
          />
        </section>
      </div>
    </div>
  );
}
