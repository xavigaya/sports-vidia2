import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { LanguagePicker } from '../components/LanguagePicker';
import { ErrorBox } from '../components/ui';

export function LoginPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName } },
        });
        if (error) throw error;
        if (!data.session) setInfo(t('auth.checkEmail'));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <div className="auth-brand">
          <BallMark />
          <div>
            <h1>{t('app.name')}</h1>
            <p className="muted">{t('app.tagline')}</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="stack">
          {mode === 'signUp' && (
            <label className="field">
              <span>{t('auth.displayName')}</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required autoComplete="name" />
            </label>
          )}
          <label className="field">
            <span>{t('auth.email')}</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="field">
            <span>{t('auth.password')}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            />
            {mode === 'signUp' && <small className="muted">{t('auth.passwordHint')}</small>}
          </label>

          {error && <ErrorBox message={error} />}
          {info && <div className="notice">{info}</div>}

          <button className="btn btn-primary btn-lg" disabled={busy}>
            {mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
          </button>
        </form>

        <button className="btn-link" onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
          {mode === 'signIn' ? t('auth.noAccount') : t('auth.haveAccount')}
        </button>

        <div className="auth-footer">
          <LanguagePicker />
        </div>
      </div>
    </div>
  );
}

export function BallMark({ size = 48 }: { size?: number }) {
  return <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={size} height={size} alt="" className="ball-mark" />;
}
