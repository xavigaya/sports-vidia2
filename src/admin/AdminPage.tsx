// Administració de la plataforma (només superadministradors):
// clubs, usuaris, invitacions i registre d'accions.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useClub } from '../club/ClubProvider';
import { ROLES, type ClubRole } from '../lib/types';
import { EmptyState, ErrorBox, Modal, PageHeader, Spinner } from '../components/ui';
import { AuditLogView } from './AuditLogView';

interface AdminClub {
  id: string;
  name: string;
  short_name: string | null;
  primary_color: string;
  created_at: string;
  members: number;
  admins: number;
  teams: number;
  players: number;
  matches: number;
  pending_invitations: number;
}

interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  is_superadmin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  memberships: { club_id: string; club_name: string; role: ClubRole }[];
}

interface AdminInvitation {
  id: string;
  club_id: string;
  club_name: string;
  email: string;
  role: ClubRole;
  created_at: string;
}

type Tab = 'clubs' | 'users' | 'invitations' | 'log';
const TABS: Tab[] = ['clubs', 'users', 'invitations', 'log'];

export function AdminPage() {
  const { t } = useTranslation();
  const { isSuperadmin } = useClub();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'clubs';

  if (!isSuperadmin) return <ErrorBox message={t('admin.onlySuper')} />;

  return (
    <div className="page page-wide">
      <PageHeader title={t('admin.title')} />
      <div className="segmented tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams({ tab: k })}>
            {t(`admin.tab_${k}`)}
          </button>
        ))}
      </div>
      {tab === 'clubs' && <ClubsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'invitations' && <InvitationsTab />}
      {tab === 'log' && <AuditLogView />}
    </div>
  );
}

function useClubsList() {
  const [clubs, setClubs] = useState<AdminClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_clubs');
    if (error) setError(error.message);
    else setClubs((data ?? []) as AdminClub[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { clubs, loading, error, setError, load };
}

// ---------------------------------------------------------------------
// Clubs
// ---------------------------------------------------------------------
function ClubsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectClub, refresh } = useClub();
  const { clubs, loading, error, setError, load } = useClubsList();
  const [creating, setCreating] = useState(false);

  async function onDelete(c: AdminClub) {
    const answer = window.prompt(t('admin.deleteClubConfirm', { name: c.name }));
    if (answer?.trim() !== c.name) return;
    const { error } = await supabase.from('clubs').delete().eq('id', c.id);
    if (error) setError(error.message);
    await load();
    await refresh();
  }

  return (
    <section className="card stack">
      <div className="row between wrap">
        <h2>{t('admin.tab_clubs')}</h2>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + {t('admin.newClub')}
        </button>
      </div>
      {error && <ErrorBox message={error} />}
      {loading ? (
        <Spinner />
      ) : clubs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('club.name')}</th>
                <th className="num-cell">{t('admin.members')}</th>
                <th className="num-cell">{t('admin.admins')}</th>
                <th className="num-cell">{t('nav.teams')}</th>
                <th className="num-cell">{t('nav.players')}</th>
                <th className="num-cell">{t('nav.matches')}</th>
                <th className="num-cell">{t('admin.pending')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clubs.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="swatch-dot" style={{ background: c.primary_color }} /> <strong>{c.name}</strong>
                    {c.short_name && <span className="muted small"> · {c.short_name}</span>}
                  </td>
                  <td className="num-cell">{c.members}</td>
                  <td className="num-cell">{c.admins === 0 ? <span className="warn-text">0</span> : c.admins}</td>
                  <td className="num-cell">{c.teams}</td>
                  <td className="num-cell">{c.players}</td>
                  <td className="num-cell">{c.matches}</td>
                  <td className="num-cell">{c.pending_invitations}</td>
                  <td className="nowrap">
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        selectClub(c.id);
                        navigate('/');
                      }}
                    >
                      {t('admin.openClub')}
                    </button>{' '}
                    <button className="btn btn-sm btn-danger" onClick={() => void onDelete(c)}>
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal title={t('admin.newClub')} open={creating} onClose={() => setCreating(false)}>
        {creating && (
          <CreateClubForm
            onDone={async () => {
              setCreating(false);
              await load();
              await refresh();
            }}
          />
        )}
      </Modal>
    </section>
  );
}

function CreateClubForm({ onDone }: { onDone: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [join, setJoin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('create_club', {
      p_name: name.trim(),
      p_short_name: shortName.trim(),
      p_admin_email: adminEmail.trim().toLowerCase() || null,
      p_join: join,
    });
    setBusy(false);
    if (error) setError(error.message);
    else await onDone();
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <div className="grid-2">
        <label className="field">
          <span>{t('club.name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
        </label>
        <label className="field">
          <span>{t('club.shortName')}</span>
          <input value={shortName} onChange={(e) => setShortName(e.target.value)} maxLength={12} />
        </label>
      </div>
      <label className="field">
        <span>
          {t('admin.clubAdminEmail')} <em className="muted">({t('common.optional')})</em>
        </span>
        <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
        <small className="muted">{t('admin.clubAdminHelp')}</small>
      </label>
      <label className="check">
        <input type="checkbox" checked={join} onChange={(e) => setJoin(e.target.checked)} />
        {t('admin.joinAsAdmin')}
      </label>
      {error && <ErrorBox message={error} />}
      <div className="row end">
        <button className="btn btn-primary" disabled={busy}>
          {t('common.create')}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Usuaris
// ---------------------------------------------------------------------
function UsersTab() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { refresh } = useClub();
  const { clubs } = useClubsList();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<Record<string, { club: string; role: ClubRole }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) setError(error.message);
    else setUsers((data ?? []) as AdminUser[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' });
  const q = query.trim().toLowerCase();
  const visible = users.filter((u) => !q || u.email.toLowerCase().includes(q) || (u.display_name ?? '').toLowerCase().includes(q));

  async function run(p: PromiseLike<{ error: { message: string } | null }>, self = false) {
    setError(null);
    const { error } = await p;
    if (error) setError(error.message === 'last_superadmin' ? t('admin.lastSuper') : error.message);
    await load();
    if (self) await refresh();
  }

  return (
    <section className="card stack">
      <div className="row between wrap">
        <h2>
          {t('admin.tab_users')} <span className="muted">({users.length})</span>
        </h2>
        <input className="search" placeholder={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {error && <ErrorBox message={error} />}
      <p className="small muted">{t('admin.usersHelp')}</p>
      {loading ? (
        <Spinner />
      ) : (
        <div className="table-scroll">
          <table className="table admin-users">
            <thead>
              <tr>
                <th>{t('auth.email')}</th>
                <th>{t('admin.superadmin')}</th>
                <th>{t('admin.clubsRoles')}</th>
                <th>{t('admin.lastSignIn')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => {
                const add = adding[u.id] ?? { club: '', role: 'viewer' as ClubRole };
                const free = clubs.filter((c) => !u.memberships.some((m) => m.club_id === c.id));
                return (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.display_name ?? u.email}</strong>
                      {u.id === user?.id && <span className="muted"> ({t('members.you')})</span>}
                      <div className="muted small">{u.email}</div>
                    </td>
                    <td>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={u.is_superadmin}
                          onChange={(e) => {
                            if (!e.target.checked && u.id === user?.id && !window.confirm(t('admin.removeSelfSuper'))) return;
                            void run(supabase.rpc('admin_set_superadmin', { p_user: u.id, p_value: e.target.checked }), u.id === user?.id);
                          }}
                        />
                      </label>
                    </td>
                    <td>
                      <div className="stack-sm">
                        {u.memberships.map((m) => (
                          <div key={m.club_id} className="row wrap membership-row">
                            <span className="grow">{m.club_name}</span>
                            <select
                              value={m.role}
                              onChange={(e) =>
                                void run(
                                  supabase.rpc('admin_set_member', { p_club: m.club_id, p_user: u.id, p_role: e.target.value }),
                                  u.id === user?.id,
                                )
                              }
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {t(`roles.${r}`)}
                                </option>
                              ))}
                            </select>
                            <button
                              className="btn btn-sm"
                              title={t('admin.removeFromClub')}
                              onClick={() => {
                                if (!window.confirm(t('admin.removeFromClubConfirm', { club: m.club_name }))) return;
                                void run(supabase.from('club_members').delete().eq('club_id', m.club_id).eq('user_id', u.id), u.id === user?.id);
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {free.length > 0 && (
                          <div className="row wrap membership-row">
                            <select
                              className="grow"
                              value={add.club}
                              onChange={(e) => setAdding((a) => ({ ...a, [u.id]: { ...add, club: e.target.value } }))}
                            >
                              <option value="">+ {t('admin.addToClub')}</option>
                              {free.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            {add.club && (
                              <>
                                <select value={add.role} onChange={(e) => setAdding((a) => ({ ...a, [u.id]: { ...add, role: e.target.value as ClubRole } }))}>
                                  {ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      {t(`roles.${r}`)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => {
                                    setAdding((a) => ({ ...a, [u.id]: { club: '', role: 'viewer' } }));
                                    void run(supabase.rpc('admin_set_member', { p_club: add.club, p_user: u.id, p_role: add.role }), u.id === user?.id);
                                  }}
                                >
                                  {t('common.add')}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="small muted nowrap">{u.last_sign_in_at ? fmt.format(new Date(u.last_sign_in_at)) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Invitacions
// ---------------------------------------------------------------------
function InvitationsTab() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { clubs } = useClubsList();
  const [list, setList] = useState<AdminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [club, setClub] = useState('');
  const [role, setRole] = useState<ClubRole>('analyst');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_invitations');
    if (error) setError(error.message);
    else setList((data ?? []) as AdminInvitation[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase
      .from('club_invitations')
      .upsert({ club_id: club, email: email.trim().toLowerCase(), role, invited_by: user?.id, accepted_at: null }, { onConflict: 'club_id,email' });
    if (error) {
      setError(error.message);
      return;
    }
    setEmail('');
    await load();
  }

  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short' });

  return (
    <>
      <form onSubmit={onInvite} className="card stack">
        <h2>{t('members.invite')}</h2>
        <div className="row wrap">
          <label className="field grow">
            <span>{t('auth.email')}</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field grow">
            <span>{t('admin.club')}</span>
            <select value={club} onChange={(e) => setClub(e.target.value)} required>
              <option value="">—</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
      <section className="card stack">
        <h2>{t('admin.pendingInvitations')}</h2>
        {error && <ErrorBox message={error} />}
        {loading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="table">
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.email}</strong>
                    <div className="muted small">{i.club_name}</div>
                  </td>
                  <td>{t(`roles.${i.role}`)}</td>
                  <td className="small muted">{fmt.format(new Date(i.created_at))}</td>
                  <td className="nowrap">
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        await supabase.from('club_invitations').delete().eq('id', i.id);
                        await load();
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
