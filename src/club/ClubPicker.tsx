import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, publicLogoUrl } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useClub } from './ClubProvider';
import { BallMark } from '../auth/LoginPage';
import { ErrorBox } from '../components/ui';
import { LanguagePicker } from '../components/LanguagePicker';

export function ClubPicker() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { memberships, selectClub, refresh } = useClub();
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('create_club', { p_name: name.trim(), p_short_name: shortName.trim() });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    await refresh();
    selectClub(data as string);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card wide">
        <div className="auth-brand">
          <BallMark />
          <div>
            <h1>{t('club.chooseTitle')}</h1>
            <p className="muted">{user?.email}</p>
          </div>
        </div>

        {memberships.length > 0 ? (
          <ul className="club-list">
            {memberships.map((m) => {
              const logo = publicLogoUrl(m.clubs.logo_path);
              return (
                <li key={m.club_id}>
                  <button className="club-item" onClick={() => selectClub(m.club_id)}>
                    {logo ? (
                      <img src={logo} alt="" className="club-logo-sm" />
                    ) : (
                      <span className="club-initial" style={{ background: m.clubs.primary_color }}>
                        {m.clubs.name.charAt(0)}
                      </span>
                    )}
                    <span className="club-item-name">{m.clubs.name}</span>
                    <span className="badge">{t(`roles.${m.role}`)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="notice">{t('club.noClubs')}</p>
        )}

        <form onSubmit={onCreate} className="stack create-club">
          <h2>{t('club.createTitle')}</h2>
          <div className="grid-2">
            <label className="field">
              <span>{t('club.name')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
            </label>
            <label className="field">
              <span>
                {t('club.shortName')} <em className="muted">({t('common.optional')})</em>
              </span>
              <input value={shortName} onChange={(e) => setShortName(e.target.value)} maxLength={12} />
            </label>
          </div>
          {error && <ErrorBox message={error} />}
          <button className="btn btn-primary" disabled={busy}>
            {t('common.create')}
          </button>
        </form>

        <div className="auth-footer">
          <LanguagePicker />
          <button className="btn-link" onClick={() => void signOut()}>
            {t('auth.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}
