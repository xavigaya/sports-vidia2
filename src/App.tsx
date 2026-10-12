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
import { supabaseConfigured } from './lib/supabase';

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function NotConfigured() {
  const { t } = useTranslation();
  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <h1>{t('app.notConfiguredTitle')}</h1>
        <p>{t('app.notConfiguredBody')}</p>
      </div>
    </div>
  );
}
