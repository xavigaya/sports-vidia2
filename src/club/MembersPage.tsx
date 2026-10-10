import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useClub, useCurrentClub } from './ClubProvider';
import { ROLES, type ClubInvitation, type ClubMember, type ClubRole } from '../lib/types';
import { EmptyState, ErrorBox, PageHeader, Spinner } from '../components/ui';

export function MembersPage() {
  const { t } = useTranslation();
  const club = useCurrentClub();
  const { isAdmin, refresh: refreshClub } = useClub();
  const { user } = useAuth();
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [invitations, setInvitations] = useState<ClubInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ClubRole>('analyst');

  const load = useCallback(async () => {
    setLoading(true);
    const m = await supabase.rpc('list_club_members', { p_club: club.id });
    if (m.error) setError(m.error.message);
    else setMembers((m.data ?? []) as ClubMember[]);
    if (isAdmin) {
      const inv = await supabase
        .from('club_invitations')
        .select('*')
        .eq('club_id', club.id)
        .is('accepted_at', null)
        .order('created_at');
      if (!inv.error) setInvitations((inv.data ?? []) as ClubInvitation[]);
    }
    setLoading(false);
  }, [club.id, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const adminCount = members.filter((m) => m.role === 'admin').length;

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase
      .from('club_invitations')
      .upsert({ club_id: club.id, email: email.trim().toLowerCase(), role, invited_by: user?.id }, { onConflict: 'club_id,email' });
    if (error) {
      setError(error.message);
      return;
    }
    setEmail('');
    await load();
  }

  async function onChangeRole(m: ClubMember, newRole: ClubRole) {
    if (m.role === 'admin' && newRole !== 'admin' && adminCount <= 1) {
      setError(t('members.lastAdmin'));
      return;
    }
    const { error } = await supabase
      .from('club_members')
      .update({ role: newRole })
      .eq('club_id', club.id)
      .eq('user_id', m.user_id);
    if (error) setError(error.message);
    await load();
    if (m.user_id === user?.id) await refreshClub();
  }

  async function onRemove(m: ClubMember) {
    if (m.role === 'admin' && adminCount <= 1) {
      setError(t('members.lastAdmin'));
      return;
    }
    if (!window.confirm(t('common.confirmDelete'))) return;
    const { error } = await supabase.from('club_members').delete().eq('club_id', club.id).eq('user_id', m.user_id);
    if (error) setError(error.message);
    await load();
    if (m.user_id === user?.id) await refreshClub();
  }

  async function onCancelInvitation(id: string) {
    await supabase.from('club_invitations').delete().eq('id', id);
    await load();
  }

  return (
    <div className="page">
      <PageHeader title={t('members.title')} />
      {error && <ErrorBox message={error} />}

      {isAdmin && (
        <form onSubmit={onInvite} className="card stack">
          <h2>{t('members.invite')}</h2>
          <div className="row wrap">
            <label className="field grow">
              <span>{t('auth.email')}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="field">
              <span>{t('members.role')}</span>
              <select value={role} onChange={(e) => setRole(e.target.value as ClubRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary align-end">{t('common.add')}</button>
          </div>
          <small className="muted">{t('members.inviteHelp')}</small>
        </form>
      )}

      <section className="card">
        {loading ? (
          <Spinner />
        ) : members.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="table">
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>
                    <strong>{m.display_name ?? m.email}</strong>
                    {m.user_id === user?.id && <span className="muted"> ({t('members.you')})</span>}
                    <div className="muted small">{m.email}</div>
                  </td>
                  <td className="nowrap">
                    {isAdmin ? (
                      <select value={m.role} onChange={(e) => void onChangeRole(m, e.target.value as ClubRole)}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`roles.${r}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="badge">{t(`roles.${m.role}`)}</span>
                    )}
                  </td>
                  <td className="right">
                    {(isAdmin || m.user_id === user?.id) && (
                      <button className="btn btn-sm" onClick={() => void onRemove(m)}>
                        {t('members.remove')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {isAdmin && invitations.length > 0 && (
        <section className="card">
          <h2>{t('members.pending')}</h2>
          <table className="table">
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>
                    <span className="badge">{t(`roles.${i.role}`)}</span>
                  </td>
                  <td className="right">
                    <button className="btn btn-sm" onClick={() => void onCancelInvitation(i.id)}>
                      {t('common.cancel')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
