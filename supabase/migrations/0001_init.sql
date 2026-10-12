-- =====================================================================
-- Volei VidIA — Esquema inicial (fase 1)
-- Clubs amb dades aïllades, usuaris i rols, equips, jugadors i plantilles.
--
-- Principis:
--  * Cada fila pertany a un club (club_id) i la seguretat a nivell de fila
--    (RLS) impedeix que un usuari vegi dades d'un club al qual no pertany.
--  * Rols: admin (configura el club), analyst (codifica partits),
--    viewer (només consulta).
--  * Minimització de dades (RGPD): dels jugadors només es guarda el que cal
--    per a l'estadística. No es desa data de naixement, adreça, telèfon ni
--    foto. Es marca si és menor i si hi ha consentiment d'imatge, que caldrà
--    per pujar vídeos a YouTube.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipus
-- ---------------------------------------------------------------------
create type public.club_role as enum ('admin', 'analyst', 'viewer');

-- Posicions compatibles amb DataVolley:
--  S = col·locador (5), OH = receptor/atacant (2), OPP = oposat (3),
--  MB = central (4), L = líbero (1), U = indeterminat (0)
create type public.player_position as enum ('S', 'OH', 'OPP', 'MB', 'L', 'U');

create type public.team_gender as enum ('F', 'M', 'X');

-- ---------------------------------------------------------------------
-- Perfils d'usuari
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  language      text not null default 'ca',
  created_at    timestamptz not null default now()
);

-- Crea el perfil automàticament quan es registra un usuari
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Clubs i membres
-- ---------------------------------------------------------------------
create table public.clubs (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 2 and 120),
  short_name       text check (char_length(short_name) <= 12),
  primary_color    text not null default '#0b5cab' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color  text not null default '#f2b705' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_path        text,
  default_language text not null default 'ca',
  -- Regles configurables (per defecte, RFEVB)
  max_substitutions integer not null default 8 check (max_substitutions between 0 and 20),
  timeouts_per_set  integer not null default 2 check (timeouts_per_set between 0 and 5),
  created_at       timestamptz not null default now()
);

create table public.club_members (
  club_id    uuid not null references public.clubs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.club_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index club_members_user_idx on public.club_members (user_id);

create table public.club_invitations (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  email       text not null check (email = lower(email)),
  role        public.club_role not null default 'viewer',
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (club_id, email)
);

-- ---------------------------------------------------------------------
-- Funcions auxiliars de permisos (security definer per evitar recursió RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_club_member(p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club and user_id = auth.uid()
  );
$$;

create or replace function public.has_club_role(p_club uuid, p_roles public.club_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club and user_id = auth.uid() and role = any (p_roles)
  );
$$;

-- Crea un club i en fa administrador l'usuari que el crea
create or replace function public.create_club(p_name text, p_short_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.clubs (name, short_name)
  values (p_name, nullif(p_short_name, ''))
  returning id into v_club;
  insert into public.club_members (club_id, user_id, role)
  values (v_club, auth.uid(), 'admin');
  return v_club;
end;
$$;

-- Accepta les invitacions pendents adreçades al correu de l'usuari actual
create or replace function public.accept_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
  v_count integer := 0;
  r record;
begin
  if auth.uid() is null or v_email is null then
    return 0;
  end if;
  for r in
    select * from public.club_invitations
    where email = v_email and accepted_at is null
  loop
    insert into public.club_members (club_id, user_id, role)
    values (r.club_id, auth.uid(), r.role)
    on conflict (club_id, user_id) do nothing;
    update public.club_invitations set accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Llista els membres d'un club amb el seu nom (només per a membres del club)
create or replace function public.list_club_members(p_club uuid)
returns table (user_id uuid, role public.club_role, display_name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, m.role, p.display_name, u.email::text
  from public.club_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.club_id = p_club
    and public.is_club_member(p_club)
  order by p.display_name;
$$;

-- ---------------------------------------------------------------------
-- Temporades, equips i jugadors
-- ---------------------------------------------------------------------
create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs (id) on delete cascade,
  name       text not null,               -- p. ex. "2026-2027"
  starts_on  date,
  ends_on    date,
  created_at timestamptz not null default now(),
  unique (club_id, name)
);

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs (id) on delete cascade,
  season_id   uuid references public.seasons (id) on delete set null,
  name        text not null check (char_length(name) between 1 and 120),
  short_name  text check (char_length(short_name) <= 12),
  -- DataVolley identifica cada equip amb un codi curt
  code        text check (char_length(code) <= 10),
  category    text,                       -- p. ex. "Sènior", "Juvenil"
  gender      public.team_gender,
  is_own      boolean not null default true,   -- equip propi o rival
  coach       text,
  assistant   text,
  color       text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index teams_club_idx on public.teams (club_id);

create table public.players (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubs (id) on delete cascade,
  first_name     text not null check (char_length(first_name) between 1 and 80),
  last_name      text not null default '' check (char_length(last_name) <= 120),
  nickname       text check (char_length(nickname) <= 40),
  -- Codi intern compatible DataVolley (p. ex. "GAR-MAR")
  external_code  text check (char_length(external_code) <= 20),
  is_minor       boolean not null default false,
  image_consent  boolean not null default false,
  created_at     timestamptz not null default now()
);

create index players_club_idx on public.players (club_id);

-- Plantilla: relació jugador-equip amb dorsal i posició
create table public.team_players (
  team_id       uuid not null references public.teams (id) on delete cascade,
  player_id     uuid not null references public.players (id) on delete cascade,
  club_id       uuid not null references public.clubs (id) on delete cascade,
  shirt_number  smallint not null check (shirt_number between 0 and 99),
  position      public.player_position not null default 'U',
  is_captain    boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  primary key (team_id, player_id)
);

create unique index team_players_number_uq
  on public.team_players (team_id, shirt_number) where active;

-- Garanteix que l'equip i el jugador pertanyen al mateix club que la fila
create or replace function public.check_team_player_club()
returns trigger
language plpgsql
as $$
begin
  if (select club_id from public.teams where id = new.team_id) <> new.club_id
     or (select club_id from public.players where id = new.player_id) <> new.club_id then
    raise exception 'team_player_club_mismatch';
  end if;
  return new;
end;
$$;

create trigger team_players_club_check
  before insert or update on public.team_players
  for each row execute function public.check_team_player_club();

-- ---------------------------------------------------------------------
-- Seguretat a nivell de fila (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.clubs            enable row level security;
alter table public.club_members     enable row level security;
alter table public.club_invitations enable row level security;
alter table public.seasons          enable row level security;
alter table public.teams            enable row level security;
alter table public.players          enable row level security;
alter table public.team_players     enable row level security;

-- Perfils: cadascú el seu
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Clubs: els membres el veuen; només els admins el modifiquen.
-- La creació es fa amb la funció create_club().
create policy clubs_select on public.clubs
  for select using (public.is_club_member(id));
create policy clubs_update on public.clubs
  for update using (public.has_club_role(id, array['admin']::public.club_role[]))
  with check (public.has_club_role(id, array['admin']::public.club_role[]));
create policy clubs_delete on public.clubs
  for delete using (public.has_club_role(id, array['admin']::public.club_role[]));

-- Membres: cada usuari veu les seves pertinences; els admins gestionen el club
create policy members_select on public.club_members
  for select using (user_id = auth.uid() or public.has_club_role(club_id, array['admin']::public.club_role[]));
create policy members_update on public.club_members
  for update using (public.has_club_role(club_id, array['admin']::public.club_role[]))
  with check (public.has_club_role(club_id, array['admin']::public.club_role[]));
create policy members_delete on public.club_members
  for delete using (public.has_club_role(club_id, array['admin']::public.club_role[]) or user_id = auth.uid());

-- Invitacions: només admins
create policy invitations_all on public.club_invitations
  for all using (public.has_club_role(club_id, array['admin']::public.club_role[]))
  with check (public.has_club_role(club_id, array['admin']::public.club_role[]));

-- Temporades, equips, jugadors i plantilles:
-- lectura per a tots els membres; escriptura per a admins i analistes.
create policy seasons_select on public.seasons
  for select using (public.is_club_member(club_id));
create policy seasons_write on public.seasons
  for all using (public.has_club_role(club_id, array['admin','analyst']::public.club_role[]))
  with check (public.has_club_role(club_id, array['admin','analyst']::public.club_role[]));

create policy teams_select on public.teams
  for select using (public.is_club_member(club_id));
create policy teams_write on public.teams
  for all using (public.has_club_role(club_id, array['admin','analyst']::public.club_role[]))
  with check (public.has_club_role(club_id, array['admin','analyst']::public.club_role[]));

create policy players_select on public.players
  for select using (public.is_club_member(club_id));
create policy players_write on public.players
  for all using (public.has_club_role(club_id, array['admin','analyst']::public.club_role[]))
  with check (public.has_club_role(club_id, array['admin','analyst']::public.club_role[]));

create policy team_players_select on public.team_players
  for select using (public.is_club_member(club_id));
create policy team_players_write on public.team_players
  for all using (public.has_club_role(club_id, array['admin','analyst']::public.club_role[]))
  with check (public.has_club_role(club_id, array['admin','analyst']::public.club_role[]));

-- ---------------------------------------------------------------------
-- Emmagatzematge: logotips dels clubs (carpeta = id del club)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('club-logos', 'club-logos', true)
on conflict (id) do nothing;

create policy club_logos_read on storage.objects
  for select using (bucket_id = 'club-logos');

create policy club_logos_write on storage.objects
  for insert with check (
    bucket_id = 'club-logos'
    and public.has_club_role(((storage.foldername(name))[1])::uuid, array['admin']::public.club_role[])
  );

create policy club_logos_update on storage.objects
  for update using (
    bucket_id = 'club-logos'
    and public.has_club_role(((storage.foldername(name))[1])::uuid, array['admin']::public.club_role[])
  );

create policy club_logos_delete on storage.objects
  for delete using (
    bucket_id = 'club-logos'
    and public.has_club_role(((storage.foldername(name))[1])::uuid, array['admin']::public.club_role[])
  );

-- Permisos d'execució de les funcions per a usuaris autenticats
revoke all on function public.create_club(text, text) from public, anon;
revoke all on function public.accept_pending_invitations() from public, anon;
revoke all on function public.list_club_members(uuid) from public, anon;
grant execute on function public.create_club(text, text) to authenticated;
grant execute on function public.accept_pending_invitations() to authenticated;
grant execute on function public.list_club_members(uuid) to authenticated;
