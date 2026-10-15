import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { cached } from '../offline/store';
import { useAuth } from '../auth/AuthProvider';
import type { Club, ClubRole, Membership } from '../lib/types';
import { applyClubTheme } from './theme';
import { setAuditClub } from '../lib/audit';

interface ClubState {
  loading: boolean;
  error: string | null;
  memberships: Membership[];
  club: Club | null;
  role: ClubRole | null;
  canEdit: boolean; // admin o analista
  isAdmin: boolean;
  isSuperadmin: boolean;
  // El superadministrador és dins d'un club del qual no és membre
  virtual: boolean;
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
  const [isSuperadmin, setIsSuperadmin] = useState(false);
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
    if (navigator.onLine !== false) await supabase.rpc('accept_pending_invitations');
    // Amb còpia local: sense connexió es pot continuar treballant amb el club
    const { data, error } = await cached(`memberships:${user.id}`, () =>
      supabase.from('club_members').select('club_id, role, clubs(*)').eq('user_id', user.id),
    );
    // Superadministrador: té accés a tots els clubs
    const prof = await cached(`profile:${user.id}`, () => supabase.from('profiles').select('is_superadmin').eq('id', user.id).maybeSingle());
    const superadmin = !!(prof.data as { is_superadmin?: boolean } | null)?.is_superadmin;
    setIsSuperadmin(superadmin);
    if (error) {
      setError(error.message);
    } else {
      const list = ((data ?? []) as unknown as Membership[]).filter((m) => m.clubs);
      if (superadmin) {
        const all = await cached(`allclubs:${user.id}`, () => supabase.from('clubs').select('*').order('name'));
        for (const c of (all.data ?? []) as Club[]) {
          if (!list.some((m) => m.club_id === c.id)) list.push({ club_id: c.id, role: 'admin', clubs: c, virtual: true });
        }
      }
      list.sort((a, b) => a.clubs.name.localeCompare(b.clubs.name));
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
    setAuditClub(current?.club_id ?? null);
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
    isSuperadmin,
    virtual: !!current?.virtual,
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
