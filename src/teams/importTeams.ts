import { supabase } from '../lib/supabase';
import type { Team, TeamPlayer } from '../lib/types';
import type { CsvPlayerRow } from './teamCsv';
import { teamsToCsv, type ExportTeam } from './teamCsv';

export interface ImportOptions {
  clubId: string;
  targetTeam: Team | null; // si s'importa dins d'un equip concret
  newTeamsOwn: boolean;
  seasonId: string | null;
}

export interface ImportSummary {
  teamsCreated: number;
  playersCreated: number;
  playersUpdated: number;
  errors: string[];
}

// Afegeix o actualitza jugadors a partir de files CSV.
// Si el dorsal ja existeix a l'equip, s'actualitza el jugador; si no, se'n crea un de nou.
export async function importPlayers(rows: CsvPlayerRow[], opts: ImportOptions): Promise<ImportSummary> {
  const summary: ImportSummary = { teamsCreated: 0, playersCreated: 0, playersUpdated: 0, errors: [] };

  // Agrupa per equip
  const groups = new Map<string, CsvPlayerRow[]>();
  for (const r of rows) {
    const key = opts.targetTeam ? opts.targetTeam.id : (r.team ?? '').trim().toLowerCase();
    if (!key) {
      summary.errors.push(`${r.number} ${r.firstName}: sense equip`);
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const { data: existingTeams } = await supabase.from('teams').select('*').eq('club_id', opts.clubId);
  const teams = (existingTeams ?? []) as Team[];

  for (const [key, list] of groups) {
    let team: Team | undefined = opts.targetTeam ?? undefined;
    if (!team) {
      const candidates = teams.filter((t) => t.name.trim().toLowerCase() === key);
      team = candidates.find((t) => !t.archived) ?? candidates[0];
    }
    if (!team) {
      const first = list[0];
      const { data, error } = await supabase
        .from('teams')
        .insert({
          club_id: opts.clubId,
          season_id: opts.seasonId,
          name: first.team!.trim(),
          code: first.teamCode?.toUpperCase() ?? null,
          category: first.category,
          is_own: first.own ?? opts.newTeamsOwn,
        })
        .select()
        .single();
      if (error || !data) {
        summary.errors.push(`${first.team}: ${error?.message}`);
        continue;
      }
      team = data as Team;
      teams.push(team);
      summary.teamsCreated += 1;
    }

    const { data: rosterData } = await supabase.from('team_players').select('*, players(*)').eq('team_id', team.id);
    const roster = (rosterData ?? []) as TeamPlayer[];

    for (const r of list) {
      const existing = roster.find((tp) => tp.active && tp.shirt_number === r.number);
      const playerFields = {
        first_name: r.firstName,
        last_name: r.lastName,
        nickname: r.nickname,
        is_minor: r.minor,
        image_consent: r.imageConsent,
      };
      if (existing) {
        const a = await supabase.from('players').update(playerFields).eq('id', existing.player_id);
        const b = await supabase
          .from('team_players')
          .update({ position: r.position, is_captain: r.captain })
          .eq('team_id', team.id)
          .eq('player_id', existing.player_id);
        if (a.error || b.error) summary.errors.push(`${r.number} ${r.firstName}: ${(a.error ?? b.error)?.message}`);
        else summary.playersUpdated += 1;
        continue;
      }
      const { data: p, error } = await supabase
        .from('players')
        .insert({ club_id: opts.clubId, ...playerFields })
        .select('id')
        .single();
      if (error || !p) {
        summary.errors.push(`${r.number} ${r.firstName}: ${error?.message}`);
        continue;
      }
      const tp = await supabase.from('team_players').insert({
        team_id: team.id,
        player_id: (p as { id: string }).id,
        club_id: opts.clubId,
        shirt_number: r.number,
        position: r.position,
        is_captain: r.captain,
      });
      if (tp.error) summary.errors.push(`${r.number} ${r.firstName}: ${tp.error.message}`);
      else summary.playersCreated += 1;
    }
  }
  return summary;
}

// Plantilles (equips amb jugadors actius) per exportar
export async function loadTeamsForExport(clubId: string, teamIds?: string[]): Promise<ExportTeam[]> {
  let q = supabase
    .from('teams')
    .select('name, code, category, is_own, team_players(shirt_number, position, is_captain, active, players(first_name, last_name, nickname, is_minor, image_consent))')
    .eq('club_id', clubId)
    .order('name');
  if (teamIds) q = q.in('id', teamIds);
  const { data } = await q;
  return ((data ?? []) as unknown as (ExportTeam & { team_players: (ExportTeam['players'][number] & { active: boolean })[] })[]).map(
    (t) => ({ ...t, players: t.team_players.filter((p) => p.active) }),
  );
}

export async function exportTeamsCsv(clubId: string, teamIds?: string[]): Promise<string> {
  return teamsToCsv(await loadTeamsForExport(clubId, teamIds));
}
