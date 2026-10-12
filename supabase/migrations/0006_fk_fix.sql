-- =====================================================================
-- Volei VidIA — Correcció de claus foranes
-- =====================================================================
-- Un jugador o un equip que ha jugat partits continua sense poder-se
-- esborrar directament (les estadístiques en depenen), però la restricció
-- es comprova al final de l'operació. Així, eliminar el club sencer
-- (que esborra en cascada partits, jugadors i equips) ja no falla.

alter table public.match_players drop constraint if exists match_players_player_id_fkey;
alter table public.match_players
  add constraint match_players_player_id_fkey
  foreign key (player_id) references public.players (id) on delete no action;

alter table public.matches drop constraint if exists matches_home_team_id_fkey;
alter table public.matches
  add constraint matches_home_team_id_fkey
  foreign key (home_team_id) references public.teams (id) on delete no action;

alter table public.matches drop constraint if exists matches_away_team_id_fkey;
alter table public.matches
  add constraint matches_away_team_id_fkey
  foreign key (away_team_id) references public.teams (id) on delete no action;
