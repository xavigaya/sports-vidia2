import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useCurrentClub } from '../club/ClubProvider';
import { playerDisplayName, type MatchPlayer, type MatchEventRow, type MatchWithTeams, type Season, type Team } from '../lib/types';
import { EmptyState, ErrorBox, PageHeader, Spinner } from '../components/ui';
import { MATCH_SELECT, rowToEvent, rulesOf } from '../matches/useMatch';
import type { Side } from '../engine/match';
import { addSkills, addTeam, addZones, computeMatchStats, emptyLine, emptyTeamStats, type Line, type TeamStats } from './compute';
import { PlayerTable, RotationTable, TeamSummary, ZoneMap, type PlayerRow } from './StatsTables';
import { downloadStatsWorkbook, playersSheet, rotationsSheet, teamSummaryRows } from './excel';
import { GeneralStatsTable } from '../reports/GeneralStatsTable';
import { exportSeasonGeneralPdf } from '../reports/exportReports';
import { RadarChart } from './RadarChart';
import { radarValues } from './radar';

// Llegeix totes les files (Supabase en retorna com a màxim 1000 per petició)
async function fetchAllEvents(matchIds: string[]): Promise<MatchEventRow[]> {
  const out: MatchEventRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('match_events')
      .select('match_id, seq, set_number, type, data, video_time, created_at')
      .in('match_id', matchIds)
      .order('match_id')
      .order('seq')
      .range(from, from + page - 1);
    if (error) throw error;
    out.push(...((data ?? []) as MatchEventRow[]));
    if (!data || data.length < page) break;
  }
  return out;
}

interface Aggregate {
  team: TeamStats;
  players: PlayerRow[];
  won: number;
  lost: number;
  sets: number;
}

export function TeamStatsPage() {
  const { t, i18n } = useTranslation();
  const club = useCurrentClub();
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [teamId, setTeamId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [matches, setMatches] = useState<MatchWithTeams[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [agg, setAgg] = useState<Aggregate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from('teams')
      .select('*')
      .eq('club_id', club.id)
      .eq('is_own', true)
      .eq('archived', false)
      .order('name')
      .then(({ data }) => {
        const list = (data ?? []) as Team[];
        setTeams(list);
        if (list[0]) setTeamId((v) => v || list[0].id);
      });
    void supabase
      .from('seasons')
      .select('*')
      .eq('club_id', club.id)
      .order('name', { ascending: false })
      .then(({ data }) => setSeasons((data ?? []) as Season[]));
  }, [club.id]);

  // Partits de l'equip
  useEffect(() => {
    if (!teamId) return;
    let q = supabase
      .from('matches')
      .select(MATCH_SELECT)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .neq('status', 'scheduled')
      .order('played_at', { ascending: true });
    if (seasonId) q = q.eq('season_id', seasonId);
    void q.then(({ data, error }) => {
      if (error) setError(error.message);
      const list = (data ?? []) as unknown as MatchWithTeams[];
      setMatches(list);
      setSelected(new Set(list.map((m) => m.id)));
    });
  }, [teamId, seasonId]);

  // Càlcul acumulat dels partits seleccionats
  useEffect(() => {
    const chosen = matches.filter((m) => selected.has(m.id));
    if (!teamId || chosen.length === 0) {
      setAgg(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const ids = chosen.map((m) => m.id);
      const [rows, mp] = await Promise.all([
        fetchAllEvents(ids),
        supabase.from('match_players').select('*, players(id, first_name, last_name, nickname)').in('match_id', ids),
      ]);
      if (mp.error) throw mp.error;
      const allPlayers = (mp.data ?? []) as MatchPlayer[];
      const team = emptyTeamStats();
      const lines = new Map<string, { number: number; name: string; line: Line; matches: number }>();
      let won = 0;
      let lost = 0;
      let setsPlayed = 0;
      for (const match of chosen) {
        const side: Side = match.home_team_id === teamId ? 'H' : 'A';
        const players = allPlayers.filter((p) => p.match_id === match.id);
        const setters = {
          H: players.filter((p) => p.side === 'H' && p.position === 'S').map((p) => p.shirt_number),
          A: players.filter((p) => p.side === 'A' && p.position === 'S').map((p) => p.shirt_number),
        };
        const events = rows.filter((r) => r.match_id === match.id).map(rowToEvent);
        const st = computeMatchStats(events, rulesOf(match), { setters });
        addTeam(team, st.teams[side]);
        for (const [num, line] of Object.entries(st.players[side])) {
          const p = players.find((x) => x.side === side && x.shirt_number === Number(num));
          const key = p?.player_id ?? `#${num}`;
          const cur = lines.get(key) ?? { number: Number(num), name: p ? playerDisplayName(p.players) : '', line: emptyLine(), matches: 0 };
          addSkills(cur.line.skills, line.skills);
          addZones(cur.line.zones, line.zones);
          cur.matches += 1;
          cur.number = Number(num);
          lines.set(key, cur);
        }
        setsPlayed += (match.set_scores ?? []).filter((x) => x.h + x.a > 0).length || match.home_sets + match.away_sets;
        const mine = side === 'H' ? match.home_sets : match.away_sets;
        const theirs = side === 'H' ? match.away_sets : match.home_sets;
        if (match.status === 'finished') {
          if (mine > theirs) won += 1;
          else lost += 1;
        }
      }
      const players: PlayerRow[] = [...lines.entries()]
        .map(([key, v]) => ({ key, number: v.number, name: v.name, line: v.line, matches: v.matches }))
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      if (!cancelled) setAgg({ team, players, won, lost, sets: setsPlayed });
    })()
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [matches, selected, teamId]);

  const team = teams.find((x) => x.id === teamId);
  const fmt = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short' }), [i18n.language]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="page page-wide">
      <PageHeader
        title={t('stats.title')}
        actions={
          <div className="row wrap">
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label={t('teams.title')}>
              {teams.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <button
              className="btn"
              disabled={!agg || !team}
              onClick={() => {
                if (!agg || !team) return;
                const seasonName = seasons.find((s) => s.id === seasonId)?.name ?? t('stats.allSeasons');
                void downloadStatsWorkbook(`${team.name} ${seasonName}`, [
                  { name: t('excel.summary'), rows: [[t('stats.record', { won: agg.won, lost: agg.lost })], [], ...teamSummaryRows(t, team.name, agg.team)], widths: [26, 14, 10] },
                  playersSheet(t, t('stats.players'), agg.players, { key: 't', number: null, name: t('stats.teamTotal'), line: agg.team }, true),
                  rotationsSheet(t, [{ name: team.name, team: agg.team }]),
                ]).catch((e: Error) => setError(e.message));
              }}
            >
              ⤒ Excel
            </button>
            <button
              className="btn"
              disabled={!agg || !team}
              title={t('report.general')}
              onClick={() => {
                if (!agg || !team) return;
                const seasonName = seasons.find((s) => s.id === seasonId)?.name ?? t('stats.allSeasons');
                void exportSeasonGeneralPdf(
                  {
                    teamName: team.name,
                    subtitle: seasonName,
                    lines: [t('report.seasonLine', { n: selected.size, record: t('stats.record', { won: agg.won, lost: agg.lost }) })],
                    rows: agg.players.map((p) => ({ label: `${p.number ?? ''} ${p.name}`.trim(), skills: p.line.skills })),
                    total: agg.team.skills,
                  },
                  t,
                ).catch((e: Error) => setError(e.message));
              }}
            >
              ⤒ {t('report.pdf')}
            </button>
            <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} aria-label={t('teams.season')}>
              <option value="">{t('stats.allSeasons')}</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        }
      />
      {error && <ErrorBox message={error} />}
      {teams.length === 0 ? (
        <div className="card">
          <EmptyState>{t('stats.noOwnTeams')}</EmptyState>
        </div>
      ) : (
        <>
          <details className="card match-picker" open={matches.length > 0 && matches.length <= 6}>
            <summary>
              {t('stats.matchesSelected', { n: selected.size, total: matches.length })}
            </summary>
            <div className="row wrap picker-actions">
              <button className="btn btn-sm" onClick={() => setSelected(new Set(matches.map((m) => m.id)))}>
                {t('matches.selectAll')}
              </button>
              <button className="btn btn-sm" onClick={() => setSelected(new Set())}>
                {t('matches.selectNone')}
              </button>
            </div>
            <ul className="picker-list">
              {matches.map((m) => (
                <li key={m.id}>
                  <label className="check">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                    <span className="muted small mono">{m.played_at ? fmt.format(new Date(m.played_at)) : '—'}</span>
                    <span>
                      {m.home.name} – {m.away.name}
                    </span>
                    <span className="mono small">
                      {m.home_sets}-{m.away_sets}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </details>

          {loading && <Spinner />}
          {!loading && !agg && (
            <div className="card">
              <EmptyState>{t('stats.noMatches')}</EmptyState>
            </div>
          )}
          {!loading && agg && team && (
            <>
              <TeamSummary
                name={team.name}
                team={agg.team}
                color={team.color ?? club.primary_color}
                sets={t('stats.record', { won: agg.won, lost: agg.lost })}
              />
              <section className="card stack">
                <h2>{t('radar.title')}</h2>
                <RadarChart series={[{ name: team.name, color: team.color ?? club.primary_color, values: radarValues(agg.team, agg.sets) }]} />
                <p className="small muted">{t('radar.help')}</p>
              </section>
              <section className="card stack">
                <h2>{t('stats.players')}</h2>
                <PlayerTable
                  rows={agg.players}
                  total={{ key: 'total', number: null, name: t('stats.teamTotal'), line: agg.team }}
                  showMatches
                />
              </section>
              <section className="card stack">
                <h2>{t('report.general')}</h2>
                <GeneralStatsTable
                  rows={agg.players.map((p) => ({ key: p.key, label: `${p.number ?? ''} ${p.name}`.trim(), skills: p.line.skills }))}
                  total={agg.team.skills}
                />
                <p className="small muted">{t('report.generalHelp')}</p>
              </section>
              <div className="grid-2">
                <section className="card stack">
                  <h2>{t('stats.rotations')}</h2>
                  <RotationTable team={agg.team} />
                  <p className="small muted">{t('stats.rotationHelp')}</p>
                </section>
                <section className="card stack">
                  <h2>{t('stats.zones')}</h2>
                  <ZoneMap
                    zones={(key) => (key ? agg.players.find((p) => p.key === key)?.line.zones ?? emptyLine().zones : agg.team.zones)}
                    players={agg.players.map((p) => ({ key: p.key, label: `${p.number} · ${p.name}` }))}
                  />
                </section>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
