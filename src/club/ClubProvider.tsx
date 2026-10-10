import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Club, ClubRole, Membership } from '../lib/types';
import { applyClubTheme } from './theme';

interface ClubState {
  loading: boolean;
  error: string | null;
  memberships: Membership[];
  club: Club | null;
  role: ClubRole | null;
  canEdit: boolean; // admin o analista
  isAdmin: boolean;
  selectClub: (clubId: string | null) => void;
  refresh: () => Promise<void>;
}

const ClubContext = createContext<ClubState | null>(null);
const STORAGE_KEY = 'svidia.club';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* emmagatzematge no disponible */
  }
}

export function ClubProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(readStored());

  const refresh = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // Primer s'accepten les invitacions pendents per a aquest correu
    await supabase.rpc('accept_pending_invitations');
    const { data, error } = await supabase
      .from('club_members')
      .select('club_id, role, clubs(*)')
      .eq('user_id', user.id);
    if (error) {
      setError(error.message);
    } else {
      const list = ((data ?? []) as unknown as Membership[])
        .filter((m) => m.clubs)
        .sort((a, b) => a.clubs.name.localeCompare(b.clubs.name));
      setMemberships(list);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = useMemo(() => {
    const found = memberships.find((m) => m.club_id === selectedId);
    if (found) return found;
    // Si només hi ha un club, se selecciona automàticament
    return memberships.length === 1 ? memberships[0] : null;
  }, [memberships, selectedId]);

  useEffect(() => {
    applyClubTheme(current?.clubs ?? null);
  }, [current]);

  const selectClub = useCallback((id: string | null) => {
    setSelectedId(id);
    writeStored(id);
  }, []);

  const role = current?.role ?? null;
  const value: ClubState = {
    loading,
    error,
    memberships,
    club: current?.clubs ?? null,
    role,
    canEdit: role === 'admin' || role === 'analyst',
    isAdmin: role === 'admin',
    selectClub,
    refresh,
  };

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

export function useClub(): ClubState {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error('useClub must be used inside ClubProvider');
  return ctx;
}

// Retorna el club actual; només s'ha d'usar dins de pàgines on ja n'hi ha un de seleccionat
export function useCurrentClub(): Club {
  const { club } = useClub();
  if (!club) throw new Error('No club selected');
  return club;
}
