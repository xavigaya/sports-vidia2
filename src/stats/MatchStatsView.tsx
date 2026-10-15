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
import { RadarChart } from './RadarChart';
import { radarValues } from './radar';
import { ownSide, sideColors } from './teamColors';

const PICK_KEY = 'svidia.statsTeam';
function readPick(): 'own' | 'rival' {
  try {
    return localStorage.getItem(PICK_KEY) === 'rival' ? 'rival' : 'own';
  } catch {
    return 'own';
  }
}

export function MatchStatsView({ m, onShowClips }: { m: UseMatch; onShowClips: (f: Partial<ClipFilter>) => void }) {
  const { t } = useTranslation();
  const club = useCurrentClub();
  const match = m.match!;
  const [set, setSet] = useState<number | null>(null);
  const ours = ownSide(match.home, match.away);
  const [pick, setPick] = useState<'own' | 'rival'>(readPick);
  const side: Side = pick === 'own' ? ours : ours === 'H' ? 'A' : 'H';
  const otherSide: Side = side === 'H' ? 'A' : 'H';
  function choose(p: 'own' | 'rival') {
    setPick(p);
    try {
      localStorage.setItem(PICK_KEY, p);
    } catch {
      /* sense emmagatzematge */
    }
  }

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
  const colors: Record<SideCode, string> = sideColors(match.home, match.away, club.primary_color);
  const setsPlayed = set == null ? sets.filter((s) => s.home + s.away > 0).length : 1;
  const radar = [side, otherSide].map((s) => ({ name: names[s], color: colors[s], values: radarValues(stats.teams[s], setsPlayed) }));

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
      <div className="row wrap between">
        <div className="segmented" role="tablist" aria-label={t('stats.teamPick')}>
          <button className={pick === 'own' ? 'on' : ''} onClick={() => choose('own')}>
            {t('stats.ourTeam')} <span className="small muted">· {names[ours]}</span>
          </button>
          <button className={pick === 'rival' ? 'on' : ''} onClick={() => choose('rival')}>
            {t('stats.rival')} <span className="small muted">· {names[ours === 'H' ? 'A' : 'H']}</span>
          </button>
        </div>
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
        <TeamSummary name={names[side]} team={stats.teams[side]} color={colors[side]} sets={`${setScore(side)} – ${setScore(otherSide)}`} />
        <section className="card stack">
          <h2>{t('radar.title')}</h2>
          <RadarChart series={radar} />
          <p className="small muted">{t('radar.help')}</p>
        </section>
      </div>

      <section className="card stack">
        <h2>
          {t('stats.players')} · {names[side]}
        </h2>
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
