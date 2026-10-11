-- =====================================================================
-- Sports VidIA 2 — Accions de joc, posició Universal i jugadors lligats a un equip
-- =====================================================================

-- Posició "Universal" per a jugadors que poden ocupar més d'una posició
alter type public.player_position add value if not exists 'UNI';

-- Nou tipus d'esdeveniment: acció de joc (servei, recepció, atac…)
alter table public.match_events drop constraint if exists match_events_type_check;
alter table public.match_events
  add constraint match_events_type_check
  check (type in ('lineup', 'point', 'sub', 'libero', 'timeout', 'action'));

-- Cerca d'equips pel nom (importació CSV)
create index if not exists teams_club_name_idx on public.teams (club_id, lower(name));

-- ---------------------------------------------------------------------
-- Cada jugador pertany a un sol equip
-- ---------------------------------------------------------------------
-- Si algun jugador era a més d'un equip, es manté només al primer on es va afegir
delete from public.team_players tp
using public.team_players other
where tp.player_id = other.player_id
  and (tp.created_at, tp.team_id) > (other.created_at, other.team_id);

create unique index if not exists team_players_one_team_uq on public.team_players (player_id);

-- ---------------------------------------------------------------------
-- La convocatòria d'un partit només pot incloure jugadors de la
-- plantilla de l'equip corresponent (local o visitant)
-- ---------------------------------------------------------------------
create or replace function public.check_match_player_team()
returns trigger
language plpgsql
as $$
declare
  v_team uuid;
begin
  select case when new.side = 'H' then home_team_id else away_team_id end
    into v_team
  from public.matches
  where id = new.match_id;

  if not exists (
    select 1 from public.team_players
    where team_id = v_team and player_id = new.player_id
  ) then
    raise exception 'player_not_in_team';
  end if;
  return new;
end;
$$;

drop trigger if exists match_players_team_check on public.match_players;
create trigger match_players_team_check
  before insert or update on public.match_players
  for each row execute function public.check_match_player_team();
