import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useCurrentClub } from '../club/ClubProvider';

export function HomePage() {
  const { t } = useTranslation();
  const club = useCurrentClub();
  const [counts, setCounts] = useState({ teams: 0, players: 0, members: 0 });

  useEffect(() => {
    const head = { count: 'exact' as const, head: true };
    void Promise.all([
      supabase.from('teams').select('id', head).eq('club_id', club.id).eq('is_own', true).eq('archived', false),
      supabase.from('players').select('id', head).eq('club_id', club.id),
      supabase.rpc('list_club_members', { p_club: club.id }),
    ]).then(([tm, pl, mb]) =>
      setCounts({ teams: tm.count ?? 0, players: pl.count ?? 0, members: (mb.data as unknown[] | null)?.length ?? 0 }),
    );
  }, [club.id]);

  return (
    <div className="page">
      <div className="hero card">
        <h1>{t('home.welcome', { club: club.name })}</h1>
        <p className="muted">{t('home.phaseNote')}</p>
      </div>
      <div className="stat-grid">
        <Link to="/teams" className="stat card">
          <span className="stat-value">{counts.teams}</span>
          <span className="stat-label">{t('home.teams')}</span>
        </Link>
        <Link to="/players" className="stat card">
          <span className="stat-value">{counts.players}</span>
          <span className="stat-label">{t('home.players')}</span>
        </Link>
        <Link to="/members" className="stat card">
          <span className="stat-value">{counts.members}</span>
          <span className="stat-label">{t('home.members')}</span>
        </Link>
      </div>
    </div>
  );
}

export function MatchesPage() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <div className="card empty">{t('matches.comingSoon')}</div>
    </div>
  );
}
