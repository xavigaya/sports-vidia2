-- =====================================================================
-- Volei VidIA — Partits (fase 2)
-- Partits, convocatòria i esdeveniments (alineacions, punts, canvis,
-- líberos, temps morts). L'estat del partit es calcula a l'aplicació
-- reproduint els esdeveniments en ordre.
--
-- Un sol usuari codifica cada partit (coder_id); la resta de membres
-- del club el poden seguir en directe i revisar-lo.
-- =====================================================================

create type public.match_status as enum ('scheduled', 'live', 'finished');

create table public.matches (
  id                uuid primary key default gen_random_uuid(),
  club_id           uuid not null references public.clubs (id) on delete cascade,
  season_id         uuid references public.seasons (id) on delete set null,
  home_team_id      uuid not null references public.teams (id) on delete restrict,
  away_team_id      uuid not null references public.teams (id) on delete restrict,
  played_at         timestamptz,
  competition       text check (char_length(competition) <= 120),
  phase             text check (char_length(phase) <= 60),        -- jornada, fase…
  venue             text check (char_length(venue) <= 120),
  status            public.match_status not null default 'scheduled',
  -- Regles copiades del club en crear el partit (es poden ajustar)
  sets_to_win       smallint not null default 3 check (sets_to_win between 1 and 3),
  points_per_set    smallint not null default 25 check (points_per_set between 5 and 50),
  tiebreak_points   smallint not null default 15 check (tiebreak_points between 5 and 50),
  max_substitutions smallint not null default 8 check (max_substitutions between 0 and 20),
  timeouts_per_set  smallint not null default 2 check (timeouts_per_set between 0 and 5),
  -- Resum per a llistats (s'actualitza des de l'aplicació)
  home_sets         smallint not null default 0,
  away_sets         smallint not null default 0,
  set_scores        jsonb not null default '[]'::jsonb,   -- [{h:25,a:20}, …]
  coder_id          uuid references auth.users (id) on delete set null,
  notes             text,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

create index matches_club_idx on public.matches (club_id, played_at desc);

-- Convocatòria: jugadors de cada equip disponibles en aquest partit
create table public.match_players (
  match_id      uuid not null references public.matches (id) on delete cascade,
  club_id       uuid not null references public.clubs (id) on delete cascade,
  side          char(1) not null check (side in ('H', 'A')),
  player_id     uuid not null references public.players (id) on delete restrict,
  shirt_number  smallint not null check (shirt_number between 0 and 99),
  position      public.player_position not null default 'U',
  is_libero     boolean not null default false,
  is_captain    boolean not null default false,
  primary key (match_id, player_id)
);

create unique index match_players_number_uq on public.match_players (match_id, side, shirt_number);

-- Esdeveniments del partit, en ordre (seq)
create table public.match_events (
  match_id    uuid not null references public.matches (id) on delete cascade,
  club_id     uuid not null references public.clubs (id) on delete cascade,
  seq         integer not null check (seq > 0),
  set_number  smallint not null check (set_number between 1 and 5),
  type        text not null check (type in ('lineup', 'point', 'sub', 'libero', 'timeout')),
  data        jsonb not null,            -- contingut segons el tipus
  video_time  double precision,          -- segons dins el vídeo (fase 4)
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (match_id, seq)
);

-- Coherència de club entre taules filles i el partit
create or replace function public.check_match_child_club()
returns trigger
language plpgsql
as $$
begin
  if (select club_id from public.matches where id = new.match_id) <> new.club_id then
    raise exception 'match_club_mismatch';
  end if;
  return new;
end;
$$;

create trigger match_players_club_check before insert or update on public.match_players
  for each row execute function public.check_match_child_club();
create trigger match_events_club_check before insert or update on public.match_events
  for each row execute function public.check_match_child_club();

create or replace function public.check_match_teams_club()
returns trigger
language plpgsql
as $$
begin
  if (select club_id from public.teams where id = new.home_team_id) <> new.club_id
     or (select club_id from public.teams where id = new.away_team_id) <> new.club_id then
    raise exception 'match_team_club_mismatch';
  end if;
  return new;
end;
$$;

create trigger matches_team_club_check before insert or update on public.matches
  for each row execute function public.check_match_teams_club();

-- Pot codificar aquest partit? (el codificador assignat o un administrador)
create or replace function public.can_code_match(p_match uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match
      and (
        (m.coder_id = auth.uid() and public.has_club_role(m.club_id, array['admin','analyst']::public.club_role[]))
        or public.has_club_role(m.club_id, array['admin']::public.club_role[])
      )
  );
$$;

-- Assigna l'usuari actual com a codificador si el partit no en té cap
create or replace function public.claim_match(p_match uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
begin
  select club_id into v_club from public.matches where id = p_match;
  if v_club is null or not public.has_club_role(v_club, array['admin','analyst']::public.club_role[]) then
    return false;
  end if;
  update public.matches set coder_id = auth.uid()
  where id = p_match and (coder_id is null or public.has_club_role(v_club, array['admin']::public.club_role[]));
  return found;
end;
$$;

revoke all on function public.claim_match(uuid) from public, anon;
grant execute on function public.claim_match(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.matches       enable row level security;
alter table public.match_players enable row level security;
alter table public.match_events  enable row level security;

create policy matches_select on public.matches
  for select using (public.is_club_member(club_id));
create policy matches_insert on public.matches
  for insert with check (public.has_club_role(club_id, array['admin','analyst']::public.club_role[]));
create policy matches_update on public.matches
  for update using (public.can_code_match(id) or (coder_id is null and public.has_club_role(club_id, array['admin','analyst']::public.club_role[])))
  with check (public.has_club_role(club_id, array['admin','analyst']::public.club_role[]));
create policy matches_delete on public.matches
  for delete using (public.can_code_match(id));

create policy match_players_select on public.match_players
  for select using (public.is_club_member(club_id));
create policy match_players_write on public.match_players
  for all using (public.can_code_match(match_id))
  with check (public.can_code_match(match_id));

create policy match_events_select on public.match_events
  for select using (public.is_club_member(club_id));
create policy match_events_write on public.match_events
  for all using (public.can_code_match(match_id))
  with check (public.can_code_match(match_id));

-- Seguiment en directe dels partits
alter publication supabase_realtime add table public.match_events;
