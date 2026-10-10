import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useClub, useCurrentClub } from '../club/ClubProvider';
import {
  POSITIONS,
  playerDisplayName,
  type Player,
  type PlayerPosition,
  type Season,
  type Team,
  type TeamPlayer,
} from '../lib/types';
import { ColorSwatch, EmptyState, ErrorBox, Modal, PageHeader, Spinner } from '../components/ui';
import { TeamForm } from './TeamForm';
import { emptyPlayer, PlayerFields } from '../players/PlayerForm';

const POSITION_ORDER: Record<PlayerPosition, number> = { S: 0, OPP: 1, OH: 2, MB: 3, L: 4, U: 5 };

export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const club = useCurrentClub();
  const { canEdit } = useClub();
  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<TeamPlayer[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    const [tm, rs, ss] = await Promise.all([
      supabase.from('teams').select('*').eq('id', teamId).single(),
      supabase.from('team_players').select('*, players(*)').eq('team_id', teamId),
      supabase.from('seasons').select('*').eq('club_id', club.id).order('name', { ascending: false }),
    ]);
    if (tm.error) setError(tm.error.message);
    else setTeam(tm.data as Team);
    if (rs.error) setError(rs.error.message);
    else setRoster((rs.data ?? []) as TeamPlayer[]);
    setSeasons((ss.data ?? []) as Season[]);
    setLoading(false);
  }, [teamId, club.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...roster].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          POSITION_ORDER[a.position] - POSITION_ORDER[b.position] ||
          a.shirt_number - b.shirt_number,
      ),
    [roster],
  );

  async function updateRow(tp: TeamPlayer, patch: Partial<Pick<TeamPlayer, 'shirt_number' | 'position' | 'is_captain' | 'active'>>) {
    setError(null);
    // Només un capità per equip
    if (patch.is_captain) {
      await supabase.from('team_players').update({ is_captain: false }).eq('team_id', tp.team_id).neq('player_id', tp.player_id);
    }
    const { error } = await supabase
      .from('team_players')
      .update(patch)
      .eq('team_id', tp.team_id)
      .eq('player_id', tp.player_id);
    if (error) setError(error.code === '23505' ? t('players.numberTaken') : error.message);
    await load();
  }

  async function removeRow(tp: TeamPlayer) {
    if (!window.confirm(t('common.confirmDelete'))) return;
    const { error } = await supabase.from('team_players').delete().eq('team_id', tp.team_id).eq('player_id', tp.player_id);
    if (error) setError(error.message);
    await load();
  }

  async function deleteTeam() {
    if (!team || !window.confirm(t('common.confirmDelete'))) return;
    const { error } = await supabase.from('teams').delete().eq('id', team.id);
    if (error) {
      setError(error.message);
      return;
    }
    navigate('/teams');
  }

  if (loading && !team) return <Spinner />;
  if (!team) return <ErrorBox message={error ?? '404'} />;

  const seasonName = seasons.find((s) => s.id === team.season_id)?.name;

  return (
    <div className="page">
      <Link to="/teams" className="back-link">
        ← {t('teams.title')}
      </Link>
      <PageHeader
        title={team.name}
        actions={
          canEdit && (
            <div className="row">
              <button className="btn" onClick={() => setEditingTeam(true)}>
                {t('common.edit')}
              </button>
              <button className="btn btn-danger" onClick={() => void deleteTeam()}>
                {t('common.delete')}
              </button>
            </div>
          )
        }
      />

      <section className="card team-meta">
        <ColorSwatch color={team.color ?? (team.is_own ? club.primary_color : null)} />
        <dl>
          {team.code && (
            <>
              <dt>{t('teams.code')}</dt>
              <dd className="mono">{team.code}</dd>
            </>
          )}
          {team.category && (
            <>
              <dt>{t('teams.category')}</dt>
              <dd>{team.category}</dd>
            </>
          )}
          {team.gender && (
            <>
              <dt>{t('teams.gender')}</dt>
              <dd>{t(`teams.gender${team.gender}`)}</dd>
            </>
          )}
          <dt>{t('teams.season')}</dt>
          <dd>{seasonName ?? t('teams.noSeason')}</dd>
          {team.coach && (
            <>
              <dt>{t('teams.coach')}</dt>
              <dd>{team.coach}</dd>
            </>
          )}
          {team.assistant && (
            <>
              <dt>{t('teams.assistant')}</dt>
              <dd>{team.assistant}</dd>
            </>
          )}
        </dl>
        <span className="badge">{team.is_own ? t('teams.own') : t('teams.opponents')}</span>
      </section>

      {error && <ErrorBox message={error} />}

      <section className="card stack">
        <div className="row between">
          <h2>
            {t('teams.roster')} <span className="muted">({roster.filter((r) => r.active).length})</span>
          </h2>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              + {t('players.addToRoster')}
            </button>
          )}
        </div>

        {sorted.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="table roster">
            <thead>
              <tr>
                <th className="num">{t('players.number')}</th>
                <th>{t('players.firstName')}</th>
                <th>{t('players.position')}</th>
                <th className="center">{t('players.captain')}</th>
                <th className="center">{t('players.active')}</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((tp) => (
                <tr key={tp.player_id} className={tp.active ? '' : 'inactive'}>
                  <td className="num">
                    {canEdit ? (
                      <input
                        key={`${tp.player_id}-${tp.shirt_number}`}
                        type="number"
                        min={0}
                        max={99}
                        defaultValue={tp.shirt_number}
                        className="num-input mono"
                        aria-label={t('players.number')}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (n !== tp.shirt_number && n >= 0 && n <= 99) void updateRow(tp, { shirt_number: n });
                        }}
                      />
                    ) : (
                      <span className="mono">{tp.shirt_number}</span>
                    )}
                  </td>
                  <td>
                    <strong>{playerDisplayName(tp.players)}</strong>
                    {tp.players.is_minor && !tp.players.image_consent && (
                      <span className="warn small" title={t('players.imageConsentHelp')}>
                        {' '}
                        ⚠
                      </span>
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <select
                        value={tp.position}
                        onChange={(e) => void updateRow(tp, { position: e.target.value as PlayerPosition })}
                      >
                        {POSITIONS.map((p) => (
                          <option key={p} value={p}>
                            {t(`positions.${p}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      t(`positions.${tp.position}`)
                    )}
                  </td>
                  <td className="center">
                    <input
                      type="checkbox"
                      checked={tp.is_captain}
                      disabled={!canEdit}
                      onChange={(e) => void updateRow(tp, { is_captain: e.target.checked })}
                      aria-label={t('players.captain')}
                    />
                  </td>
                  <td className="center">
                    <input
                      type="checkbox"
                      checked={tp.active}
                      disabled={!canEdit}
                      onChange={(e) => void updateRow(tp, { active: e.target.checked })}
                      aria-label={t('players.active')}
                    />
                  </td>
                  {canEdit && (
                    <td className="right">
                      <button className="btn btn-sm" onClick={() => void removeRow(tp)}>
                        {t('players.removeFromRoster')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Modal title={t('common.edit')} open={editingTeam} onClose={() => setEditingTeam(false)}>
        <TeamForm
          clubId={club.id}
          team={team}
          seasons={seasons}
          onSeasonCreated={() => void load()}
          onCancel={() => setEditingTeam(false)}
          onSaved={() => {
            setEditingTeam(false);
            void load();
          }}
        />
      </Modal>

      <Modal title={t('players.addToRoster')} open={adding} onClose={() => setAdding(false)}>
        <AddToRoster
          team={team}
          roster={roster}
          onDone={() => {
            setAdding(false);
            void load();
          }}
          onCancel={() => setAdding(false)}
        />
      </Modal>
    </div>
  );
}

function AddToRoster({
  team,
  roster,
  onDone,
  onCancel,
}: {
  team: Team;
  roster: TeamPlayer[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [available, setAvailable] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [draft, setDraft] = useState(emptyPlayer(team.club_id));
  const used = new Set(roster.filter((r) => r.active).map((r) => r.shirt_number));
  const firstFree = Array.from({ length: 100 }, (_, i) => i).find((n) => n > 0 && !used.has(n)) ?? 0;
  const [number, setNumber] = useState(firstFree);
  const [position, setPosition] = useState<PlayerPosition>('U');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const inRoster = new Set(roster.map((r) => r.player_id));
    supabase
      .from('players')
      .select('*')
      .eq('club_id', team.club_id)
      .order('last_name')
      .then(({ data }) => {
        const list = ((data ?? []) as Player[]).filter((p) => !inRoster.has(p.id));
        setAvailable(list);
        if (list.length === 0) setMode('new');
      });
  }, [team.club_id, roster]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (used.has(number)) {
      setError(t('players.numberTaken'));
      return;
    }
    setBusy(true);
    let pid = playerId;
    if (mode === 'new') {
      const { data, error } = await supabase
        .from('players')
        .insert({ ...draft, first_name: draft.first_name.trim(), last_name: draft.last_name.trim() })
        .select()
        .single();
      if (error) {
        setBusy(false);
        setError(error.message);
        return;
      }
      pid = (data as Player).id;
    }
    const { error } = await supabase.from('team_players').insert({
      team_id: team.id,
      player_id: pid,
      club_id: team.club_id,
      shirt_number: number,
      position,
    });
    setBusy(false);
    if (error) {
      setError(error.code === '23505' ? t('players.numberTaken') : error.message);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <div className="segmented" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'existing'}
          className={mode === 'existing' ? 'on' : ''}
          disabled={available.length === 0}
          onClick={() => setMode('existing')}
        >
          {t('players.existing')}
        </button>
        <button type="button" role="tab" aria-selected={mode === 'new'} className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>
          {t('players.createNew')}
        </button>
      </div>

      {mode === 'existing' ? (
        <label className="field">
          <span>{t('players.title')}</span>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} required>
            <option value="">—</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.last_name, p.first_name].filter(Boolean).join(', ')}
                {p.nickname ? ` (${p.nickname})` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <PlayerFields draft={draft} onChange={setDraft} />
      )}

      <div className="grid-2">
        <label className="field">
          <span>{t('players.number')}</span>
          <input type="number" min={0} max={99} value={number} onChange={(e) => setNumber(Number(e.target.value))} required />
        </label>
        <label className="field">
          <span>{t('players.position')}</span>
          <select value={position} onChange={(e) => setPosition(e.target.value as PlayerPosition)}>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(`positions.${p}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <ErrorBox message={error} />}
      <div className="row end">
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {t('common.add')}
        </button>
      </div>
    </form>
  );
}
