-- =====================================================================
-- Volei VidIA — Perfil de superadministrador
--
--  * Els superadministradors veuen i gestionen tots els clubs i usuaris,
--    sense necessitat de ser-ne membres (i poden ser, a més, membres o
--    administradors d'algun club).
--  * Només els superadministradors poden crear clubs.
--  * Primer superadministrador: xavigaya@gmail.com (ha d'estar registrat;
--    si no ho està, torna a executar el bloc final quan ho estigui).
-- =====================================================================

alter table public.profiles
  add column if not exists is_superadmin boolean not null default false;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_superadmin from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_superadmin() to authenticated;

-- Un usuari no es pot fer superadministrador a si mateix (els perfils es poden
-- editar pel propi usuari). Només un superadministrador, o l'editor SQL de
-- Supabase (sense usuari), pot canviar aquesta marca. Mai pot quedar cap
-- superadministrador.
create or replace function public.guard_superadmin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_superadmin is distinct from old.is_superadmin then
    if auth.uid() is not null and not public.is_superadmin() then
      raise exception 'not_allowed';
    end if;
    if old.is_superadmin and not new.is_superadmin
       and (select count(*) from public.profiles where is_superadmin and id <> old.id) = 0 then
      raise exception 'last_superadmin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_superadmin_guard on public.profiles;
create trigger profiles_superadmin_guard
  before update on public.profiles
  for each row execute function public.guard_superadmin_flag();

-- ---------------------------------------------------------------------
-- Funcions de permisos: el superadministrador hi té accés a tot
-- (totes les regles RLS passen per aquestes funcions)
-- ---------------------------------------------------------------------
create or replace function public.is_club_member(p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin() or exists (
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
  select public.is_superadmin() or exists (
    select 1 from public.club_members
    where club_id = p_club and user_id = auth.uid() and role = any (p_roles)
  );
$$;

create or replace function public.can_code_match(p_match uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin() or exists (
    select 1 from public.matches m
    where m.id = p_match
      and (
        (m.coder_id = auth.uid() and public.has_club_role(m.club_id, array['admin','analyst']::public.club_role[]))
        or public.has_club_role(m.club_id, array['admin']::public.club_role[])
      )
  );
$$;

-- Els superadministradors veuen tots els perfils (llista d'usuaris)
drop policy if exists profiles_select_superadmin on public.profiles;
create policy profiles_select_superadmin on public.profiles
  for select using (public.is_superadmin());

-- ---------------------------------------------------------------------
-- Creació de clubs: només superadministradors. Opcionalment s'hi convida
-- un administrador (per correu) i/o s'hi afegeix el mateix superadministrador.
-- ---------------------------------------------------------------------
drop function if exists public.create_club(text, text);

create or replace function public.create_club(
  p_name text,
  p_short_name text default null,
  p_admin_email text default null,
  p_join boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_email text := lower(trim(coalesce(p_admin_email, '')));
  v_user uuid;
begin
  if not public.is_superadmin() then
    raise exception 'not_allowed';
  end if;
  insert into public.clubs (name, short_name)
  values (trim(p_name), nullif(trim(coalesce(p_short_name, '')), ''))
  returning id into v_club;
  if p_join then
    insert into public.club_members (club_id, user_id, role)
    values (v_club, auth.uid(), 'admin');
  end if;
  if v_email <> '' then
    select id into v_user from auth.users where lower(email) = v_email;
    if v_user is not null then
      insert into public.club_members (club_id, user_id, role)
      values (v_club, v_user, 'admin')
      on conflict (club_id, user_id) do update set role = 'admin';
    else
      insert into public.club_invitations (club_id, email, role, invited_by)
      values (v_club, v_email, 'admin', auth.uid())
      on conflict (club_id, email) do update set role = 'admin', accepted_at = null;
    end if;
  end if;
  return v_club;
end;
$$;

revoke all on function public.create_club(text, text, text, boolean) from public, anon;
grant execute on function public.create_club(text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Funcions d'administració (només superadministradors)
-- ---------------------------------------------------------------------

-- Clubs amb recomptes
create or replace function public.admin_list_clubs()
returns table (
  id uuid, name text, short_name text, primary_color text, logo_path text, created_at timestamptz,
  members bigint, admins bigint, teams bigint, players bigint, matches bigint, pending_invitations bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'not_allowed';
  end if;
  return query
  select c.id, c.name, c.short_name, c.primary_color, c.logo_path, c.created_at,
    (select count(*) from public.club_members m where m.club_id = c.id),
    (select count(*) from public.club_members m where m.club_id = c.id and m.role = 'admin'),
    (select count(*) from public.teams t where t.club_id = c.id),
    (select count(*) from public.players p where p.club_id = c.id),
    (select count(*) from public.matches x where x.club_id = c.id),
    (select count(*) from public.club_invitations i where i.club_id = c.id and i.accepted_at is null)
  from public.clubs c
  order by c.name;
end;
$$;

-- Usuaris registrats amb els seus clubs i rols
create or replace function public.admin_list_users()
returns table (
  id uuid, email text, display_name text, is_superadmin boolean,
  created_at timestamptz, last_sign_in_at timestamptz, memberships jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'not_allowed';
  end if;
  return query
  select u.id, u.email::text, p.display_name, coalesce(p.is_superadmin, false),
    u.created_at, u.last_sign_in_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('club_id', m.club_id, 'club_name', c.name, 'role', m.role) order by c.name)
      from public.club_members m join public.clubs c on c.id = m.club_id
      where m.user_id = u.id
    ), '[]'::jsonb)
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by lower(u.email);
end;
$$;

-- Marca o desmarca un superadministrador
create or replace function public.admin_set_superadmin(p_user uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'not_allowed';
  end if;
  update public.profiles set is_superadmin = p_value where id = p_user;
end;
$$;

-- Afegeix (o canvia el rol d') un usuari a un club
create or replace function public.admin_set_member(p_club uuid, p_user uuid, p_role public.club_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'not_allowed';
  end if;
  insert into public.club_members (club_id, user_id, role)
  values (p_club, p_user, p_role)
  on conflict (club_id, user_id) do update set role = excluded.role;
end;
$$;

-- Totes les invitacions pendents
create or replace function public.admin_list_invitations()
returns table (id uuid, club_id uuid, club_name text, email text, role public.club_role, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'not_allowed';
  end if;
  return query
  select i.id, i.club_id, c.name, i.email, i.role, i.created_at
  from public.club_invitations i join public.clubs c on c.id = i.club_id
  where i.accepted_at is null
  order by i.created_at desc;
end;
$$;

revoke all on function public.admin_list_clubs() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_superadmin(uuid, boolean) from public, anon;
revoke all on function public.admin_set_member(uuid, uuid, public.club_role) from public, anon;
revoke all on function public.admin_list_invitations() from public, anon;
grant execute on function public.admin_list_clubs() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_superadmin(uuid, boolean) to authenticated;
grant execute on function public.admin_set_member(uuid, uuid, public.club_role) to authenticated;
grant execute on function public.admin_list_invitations() to authenticated;

-- ---------------------------------------------------------------------
-- Primer superadministrador
-- ---------------------------------------------------------------------
update public.profiles
   set is_superadmin = true
 where id in (select id from auth.users where lower(email) = 'xavigaya@gmail.com');
