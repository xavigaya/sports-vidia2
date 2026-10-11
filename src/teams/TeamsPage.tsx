import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useClub, useCurrentClub } from '../club/ClubProvider';
import type { Season, Team } from '../lib/types';
import { ColorSwatch, EmptyState, ErrorBox, Modal, PageHeader, Spinner } from '../components/ui';
import { TeamForm } from './TeamForm';
import { CsvImport } from './CsvImport';
import { exportTeamsCsv } from './importTeams';
import { downloadText, safeFilename } from '../lib/csv';

type TeamWithCount = Team & { team_players: { count: number }[] };

export function TeamsPage() {
  const { t } = useTranslation();
  const club = useCurrentClub();
  const { canEdit } = useClub();
  const [teams, setTeams] = useState<TeamWithCount[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonFilter, setSeasonFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<null | { own: boolean }>(null);
  const [importing, setImporting] = useState(false);

  const loadSeasons = useCallback(async () => {
    const { data } = await supabase.from('seasons').select('*').eq('club_id', club.id).order('name', { ascending: false });
    setSeasons((data ?? []) as Season[]);
  }, [club.id]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('teams')
      .select('*, team_players(count)')
      .eq('club_id', club.id)
      .order('name');
    if (error) setError(error.message);
    else setTeams((data ?? []) as TeamWithCount[]);
    setLoading(false);
  }, [club.id]);

  useEffect(() => {
    void loadSeasons();
    void load();
  }, [load, loadSeasons]);

  const visible = useMemo(
    () =>
      teams.filter(
        (tm) =>
          (showArchived || !tm.archived) &&
          (seasonFilter === 'all' || (seasonFilter === 'none' ? !tm.season_id : tm.season_id === seasonFilter)),
      ),
    [teams, showArchived, seasonFilter],
  );

  const seasonName = (id: string | null) => seasons.find((s) => s.id === id)?.name;

  function renderGroup(title: string, list: TeamWithCount[], own: boolean) {
    return (
      <section className="stack">
        <div className="row between">
          <h2>{title}</h2>
          {canEdit && (
            <button className="btn btn-sm" onClick={() => setCreating({ own })}>
              + {t('teams.new')}
            </button>
          )}
        </div>
        {list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="team-grid">
            {list.map((tm) => (
              <Link key={tm.id} to={`/teams/${tm.id}`} className={`team-card card ${tm.archived ? 'archived' : ''}`}>
                <div className="team-card-head">
                  <ColorSwatch color={tm.color ?? (own ? club.primary_color : null)} />
                  <strong>{tm.name}</strong>
                  {tm.code && <span className="mono muted">{tm.code}</span>}
                </div>
                <div className="muted small">
                  {[tm.category, seasonName(tm.season_id)].filter(Boolean).join(' · ') || ' '}
                </div>
                <div className="small">{t('teams.playersCount', { count: tm.team_players?.[0]?.count ?? 0 })}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={t('teams.title')}
        actions={
          <div className="row wrap">
            <select value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)} aria-label={t('teams.season')}>
              <option value="all">{t('teams.season')}: —</option>
              <option value="none">{t('teams.noSeason')}</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              {t('teams.showArchived')}
            </label>
            {canEdit && (
              <button className="btn" onClick={() => setImporting(true)}>
                ⤓ {t('csv.importBtn')}
              </button>
            )}
            <button
              className="btn"
              disabled={visible.length === 0}
              onClick={async () =>
                downloadText(`${safeFilename(club.short_name ?? club.name)}_equips.csv`, await exportTeamsCsv(club.id, visible.map((x) => x.id)))
              }
            >
              ⤒ {t('csv.exportBtn')}
            </button>
          </div>
        }
      />
      {error && <ErrorBox message={error} />}
      {loading ? (
        <Spinner />
      ) : (
        <>
          {renderGroup(
            t('teams.own'),
            visible.filter((tm) => tm.is_own),
            true,
          )}
          {renderGroup(
            t('teams.opponents'),
            visible.filter((tm) => !tm.is_own),
            false,
          )}
        </>
      )}

      <Modal title={t('csv.importTitleAll')} open={importing} onClose={() => setImporting(false)}>
        <CsvImport
          clubId={club.id}
          targetTeam={null}
          seasons={seasons}
          onDone={() => {
            setImporting(false);
            void load();
          }}
        />
      </Modal>

      <Modal title={t('teams.new')} open={creating !== null} onClose={() => setCreating(null)}>
        <TeamForm
          clubId={club.id}
          seasons={seasons}
          defaultOwn={creating?.own ?? true}
          onSeasonCreated={() => void loadSeasons()}
          onCancel={() => setCreating(null)}
          onSaved={() => {
            setCreating(null);
            void load();
          }}
        />
      </Modal>
    </div>
  );
}
