// Tipus de dades que reflecteixen l'esquema de supabase/migrations.

export type ClubRole = 'admin' | 'analyst' | 'viewer';
export type PlayerPosition = 'S' | 'OH' | 'OPP' | 'MB' | 'L' | 'UNI' | 'U';
export type TeamGender = 'F' | 'M' | 'X';

export const POSITIONS: PlayerPosition[] = ['S', 'OH', 'OPP', 'MB', 'L', 'UNI', 'U'];
export const ROLES: ClubRole[] = ['admin', 'analyst', 'viewer'];

export interface Club {
  id: string;
  name: string;
  short_name: string | null;
  primary_color: string;
  secondary_color: string;
  logo_path: string | null;
  default_language: string;
  max_substitutions: number;
  timeouts_per_set: number;
  created_at: string;
}

export interface Membership {
  club_id: string;
  role: ClubRole;
  clubs: Club;
}

export interface ClubMember {
  user_id: string;
  role: ClubRole;
  display_name: string | null;
  email: string;
}

export interface ClubInvitation {
  id: string;
  club_id: string;
  email: string;
  role: ClubRole;
  created_at: string;
  accepted_at: string | null;
}

export interface Season {
  id: string;
  club_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
}

export interface Team {
  id: string;
  club_id: string;
  season_id: string | null;
  name: string;
  short_name: string | null;
  code: string | null;
  category: string | null;
  gender: TeamGender | null;
  is_own: boolean;
  coach: string | null;
  assistant: string | null;
  color: string | null;
  archived: boolean;
  created_at: string;
}

export interface Player {
  id: string;
  club_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  external_code: string | null;
  is_minor: boolean;
  image_consent: boolean;
}

export interface TeamPlayer {
  team_id: string;
  player_id: string;
  club_id: string;
  shirt_number: number;
  position: PlayerPosition;
  is_captain: boolean;
  active: boolean;
  players: Player;
}

export function playerDisplayName(p: Pick<Player, 'first_name' | 'last_name' | 'nickname'>): string {
  if (p.nickname) return p.nickname;
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------
// Partits (fase 2)
// ---------------------------------------------------------------------
export type MatchStatus = 'scheduled' | 'live' | 'finished';
export type SideCode = 'H' | 'A';

export interface Match {
  id: string;
  club_id: string;
  season_id: string | null;
  home_team_id: string;
  away_team_id: string;
  played_at: string | null;
  competition: string | null;
  phase: string | null;
  venue: string | null;
  status: MatchStatus;
  sets_to_win: number;
  points_per_set: number;
  tiebreak_points: number;
  max_substitutions: number;
  timeouts_per_set: number;
  home_sets: number;
  away_sets: number;
  set_scores: { h: number; a: number }[];
  coder_id: string | null;
  video_url: string | null;
  video_local_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type MatchWithTeams = Match & {
  home: Pick<Team, 'id' | 'name' | 'short_name' | 'code' | 'color' | 'is_own'>;
  away: Pick<Team, 'id' | 'name' | 'short_name' | 'code' | 'color' | 'is_own'>;
};

export interface MatchPlayer {
  match_id: string;
  club_id: string;
  side: SideCode;
  player_id: string;
  shirt_number: number;
  position: PlayerPosition;
  is_libero: boolean;
  is_captain: boolean;
  players: Pick<Player, 'id' | 'first_name' | 'last_name' | 'nickname'>;
}

export interface MatchEventRow {
  match_id: string;
  club_id: string;
  seq: number;
  set_number: number;
  type: 'lineup' | 'point' | 'sub' | 'libero' | 'timeout' | 'action';
  data: Record<string, unknown>;
  video_time: number | null;
  created_at: string;
}
