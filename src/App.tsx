import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { ClubProvider, useClub } from './club/ClubProvider';
import { ClubPicker } from './club/ClubPicker';
import { ClubSettingsPage } from './club/ClubSettingsPage';
import { MembersPage } from './club/MembersPage';
import { AppShell } from './components/AppShell';
import { ErrorBox, Spinner } from './components/ui';
import { HomePage } from './pages/HomePage';
import { MatchesPage } from './matches/MatchesPage';
import { MatchPage } from './matches/MatchPage';
import { TeamStatsPage } from './stats/TeamStatsPage';
import { PlayersPage } from './players/PlayersPage';
import { TeamDetailPage } from './teams/TeamDetailPage';
import { TeamsPage } from './teams/TeamsPage';
import { AdminPage } from './admin/AdminPage';
import { saveServerConfig, supabaseConfigured } from './lib/supabase';
import { useState, type FormEvent } from 'react';
import { BallMark } from './auth/LoginPage';

// HashRouter: funciona igual al navegador, dins Tauri i dins Capacitor.
export default function App() {
  if (!supabaseConfigured) return <NotConfigured />;
  return (
    <AuthProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AuthProvider>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <LoginPage />;
  return (
    <ClubProvider>
      <ClubGate />
    </ClubProvider>
  );
}

function ClubGate() {
  const { club, loading, error } = useClub();
  if (loading && !club) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!club) return <ClubPicker />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="matches" element={<MatchesPage />} />
        <Route path="matches/:matchId" element={<MatchPage />} />
        <Route path="stats" element={<TeamStatsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="teams/:teamId" element={<TeamDetailPage />} />
        <Route path="players" element={<PlayersPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="settings" element={<ClubSettingsPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function NotConfigured() {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^https:\/\/[^/]+/.test(url.trim())) {
      setError(t('app.serverBadUrl'));
      return;
    }
    saveServerConfig({ url, key });
    window.location.reload();
  }

  return (
    <div className="auth-screen">
      <form className="auth-card card stack" onSubmit={onSubmit}>
        <div className="auth-brand">
          <BallMark />
          <div>
            <h1>{t('app.notConfiguredTitle')}</h1>
            <p className="muted">{t('app.name')}</p>
          </div>
        </div>
        <p className="small">{t('app.serverHelp')}</p>
        <label className="field">
          <span>{t('app.serverUrl')}</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxxxxxx.supabase.co" required autoComplete="off" />
        </label>
        <label className="field">
          <span>{t('app.serverKey')}</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sb_publishable_…" required autoComplete="off" />
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="btn btn-primary btn-lg">{t('app.serverSave')}</button>
      </form>
    </div>
  );
}
