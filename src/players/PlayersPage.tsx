import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useClub, useCurrentClub } from '../club/ClubProvider';
import { playerDisplayName, type Player, type PlayerPosition } from '../lib/types';
import { EmptyState, ErrorBox, Modal, PageHeader, Spinner } from '../components/ui';
import { PlayerForm } from './PlayerForm';

type PlayerRow = Player & {
  team_players: { shirt_number: number; position: PlayerPosition; active: boolean; teams: { id: string; name: string; archived: boolean } }[];
};

export function PlayersPage() {
  const { t } = useTranslation();
  const club = useCurrentClub();
  const { canEdit } = useClub();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Player | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('players')
      .select('*, team_players(shirt_number, position, active, teams(id, name, archived))')
      .eq('club_id', club.id)
      .order('last_name')
      .order('first_name');
    if (error) setError(error.message);
    else setPlayers((data ?? []) as PlayerRow[]);
    setLoading(false);
  }, [club.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return players;
    return players.filter((p) =>
      normalize([p.first_name, p.last_name, p.nickname, p.external_code].filter(Boolean).join(' ')).includes(q),
    );
  }, [players, query]);

  async function onDelete(p: Player) {
    if (!window.confirm(t('common.confirmDelete'))) return;
    const { error } = await supabase.from('players').delete().eq('id', p.id);
    if (error) setError(error.message);
    await load();
  }

  return (
    <div className="page">
      <PageHeader
        title={t('players.title')}
        actions={
          <div className="row wrap">
            <input
              type="search"
              placeholder={t('common.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('common.search')}
            />
            {canEdit && (
              <button className="btn btn-primary" onClick={() => setEditing('new')}>
                + {t('players.new')}
              </button>
            )}
          </div>
        }
      />
      <p className="privacy small">{t('players.privacyNote')}</p>
      {error && <ErrorBox message={error} />}

      <section className="card">
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('players.firstName')}</th>
                <th>{t('teams.title')}</th>
                <th className="center">{t('players.isMinor')}</th>
                <th className="center">{t('players.imageConsent')}</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{playerDisplayName(p)}</strong>
                    {p.nickname && (
                      <div className="muted small">
                        {p.first_name} {p.last_name}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="chips">
                      {p.team_players
                        .filter((tp) => tp.active && !tp.teams.archived)
                        .map((tp) => (
                          <Link key={tp.teams.id} to={`/teams/${tp.teams.id}`} className="chip">
                            <span className="mono">#{tp.shirt_number}</span> {tp.teams.name}
                          </Link>
                        ))}
                    </div>
                  </td>
                  <td className="center">{p.is_minor ? '●' : ''}</td>
                  <td className="center">{p.image_consent ? '✓' : p.is_minor ? <span className="warn">✗</span> : '–'}</td>
                  {canEdit && (
                    <td className="right nowrap">
                      <button className="btn btn-sm" onClick={() => setEditing(p)}>
                        {t('common.edit')}
                      </button>{' '}
                      <button className="btn btn-sm" onClick={() => void onDelete(p)}>
                        {t('common.delete')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Modal
        title={editing === 'new' ? t('players.new') : t('common.edit')}
        open={editing !== null}
        onClose={() => setEditing(null)}
      >
        <PlayerForm
          clubId={club.id}
          player={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      </Modal>
    </div>
  );
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
