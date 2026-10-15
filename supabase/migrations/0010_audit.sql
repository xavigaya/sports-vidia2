-- =====================================================================
-- Volei VidIA — Registre d'accions (auditoria)
--
--  * Cada alta, modificació o baixa de clubs, membres, invitacions,
--    temporades, equips, jugadors, plantilles, partits i convocatòries es
--    registra automàticament (qui, quan, club, què i quins camps canvien).
--  * Dels partits no es registra cada acció codificada (n'hi ha centenars):
--    només l'inici de cada set i els "desfer".
--  * L'aplicació hi afegeix inicis de sessió, exportacions, importacions i
--    pujades a YouTube (funció log_action).
--  * Només els superadministradors el poden consultar. Ningú el pot
--    modificar ni esborrar; les entrades de més de 3 mesos s'eliminen soles.
-- =====================================================================

create table if not exists public.audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  user_email text,
  club_id    uuid,
  action     text not null,          -- insert, update, delete, login, export, import, upload, undo, set_start…
  entity     text not null,          -- taula o tipus d'element
  entity_id  text,
  summary    text,                   -- descripció curta (nom de l'equip, del jugador…)
  changes    jsonb                   -- camps canviats {camp: [abans, després]} o dades de l'alta/baixa
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_club_idx on public.audit_log (club_id, at desc);
create index if not exists audit_log_user_idx on public.audit_log (user_id, at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (public.is_superadmin());
-- Cap política d'escriptura: només s'hi escriu des de les funcions d'aquest fitxer
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- Conservació: 3 mesos
create or replace function public.audit_purge()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  delete from public.audit_log where at < now() - interval '3 months';
  get diagnostics v = row_count;
  return v;
end;
$$;

revoke all on function public.audit_purge() from public, anon, authenticated;

create or replace function public.audit_write(
  p_action text, p_entity text, p_entity_id text, p_club uuid, p_summary text, p_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  insert into public.audit_log (user_id, user_email, club_id, action, entity, entity_id, summary, changes)
  values (
    v_uid,
    (select email::text from auth.users where id = v_uid),
    p_club, p_action, p_entity, p_entity_id, left(p_summary, 300), p_changes
  );
end;
$$;

revoke all on function public.audit_write(text, text, text, uuid, text, jsonb) from public, anon, authenticated;

-- Descripció curta de la fila (per saber de què es tracta sense obrir-la)
create or replace function public.audit_label(p_table text, r jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return case p_table
    when 'clubs' then r ->> 'name'
    when 'seasons' then r ->> 'name'
    when 'teams' then r ->> 'name'
    when 'players' then trim(coalesce(r ->> 'first_name', '') || ' ' || coalesce(r ->> 'last_name', ''))
    when 'club_members' then (select email::text from auth.users where id = (r ->> 'user_id')::uuid) || ' · ' || (r ->> 'role')
    when 'club_invitations' then (r ->> 'email') || ' · ' || (r ->> 'role')
    when 'profiles' then (select email::text from auth.users where id = (r ->> 'id')::uuid)
    when 'team_players' then
      (select name from public.teams where id = (r ->> 'team_id')::uuid) || ' · #' || (r ->> 'shirt_number') || ' ' ||
      coalesce((select trim(first_name || ' ' || last_name) from public.players where id = (r ->> 'player_id')::uuid), '')
    when 'matches' then
      coalesce((select name from public.teams where id = (r ->> 'home_team_id')::uuid), '?') || ' – ' ||
      coalesce((select name from public.teams where id = (r ->> 'away_team_id')::uuid), '?') ||
      coalesce(' · ' || to_char((r ->> 'played_at')::timestamptz, 'DD/MM/YYYY'), '')
    when 'match_players' then
      (r ->> 'side') || ' #' || (r ->> 'shirt_number') || ' ' ||
      coalesce((select trim(first_name || ' ' || last_name) from public.players where id = (r ->> 'player_id')::uuid), '')
    when 'match_events' then 'set ' || (r ->> 'set_number') || ' · #' || (r ->> 'seq')
    else null
  end;
end;
$$;

-- Disparador genèric
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_ignore text[] := array['created_at', 'updated_at'];
  v_club uuid;
  v_id text;
  v_action text := lower(tg_op);
begin
  -- Les baixes en cascada (p. ex. tot un club o tot un partit) no es registren
  -- fila per fila: ja hi ha l'entrada de l'element principal
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'DELETE' then
    if tg_table_name <> 'clubs' and v_row ? 'club_id'
       and not exists (select 1 from public.clubs where id = (v_row ->> 'club_id')::uuid) then
      return null;
    end if;
    if tg_table_name in ('match_players', 'match_events')
       and not exists (select 1 from public.matches where id = (v_row ->> 'match_id')::uuid) then
      return null;
    end if;
    if tg_table_name = 'team_players'
       and (not exists (select 1 from public.teams where id = (v_row ->> 'team_id')::uuid)
            or not exists (select 1 from public.players where id = (v_row ->> 'player_id')::uuid)) then
      return null;
    end if;
  end if;

  if tg_table_name = 'matches' then
    -- El marcador es desa a cada punt: no és una acció de gestió
    v_ignore := v_ignore || array['home_sets', 'away_sets', 'set_scores'];
  elsif tg_table_name = 'match_events' then
    -- Només inicis de set i desfer
    if tg_op = 'INSERT' and v_row ->> 'type' = 'lineup' then
      v_action := 'set_start';
    elsif tg_op = 'DELETE' then
      v_action := 'undo';
    else
      return null;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any (v_ignore)) and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_array(v_old -> v_key, v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  elsif tg_table_name = 'match_events' then
    v_changes := jsonb_build_object('type', v_row -> 'type', 'set', v_row -> 'set_number', 'seq', v_row -> 'seq');
  else
    v_changes := v_row - v_ignore;
  end if;

  v_club := case
    when tg_table_name = 'clubs' then (v_row ->> 'id')::uuid
    when v_row ? 'club_id' then (v_row ->> 'club_id')::uuid
    else null
  end;
  v_id := case
    when v_row ? 'id' then v_row ->> 'id'
    when tg_table_name in ('match_players', 'match_events') then v_row ->> 'match_id'
    when tg_table_name = 'team_players' then v_row ->> 'team_id'
    when tg_table_name = 'club_members' then v_row ->> 'user_id'
    else null
  end;

  perform public.audit_write(v_action, tg_table_name, v_id, v_club, public.audit_label(tg_table_name, v_row), v_changes);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clubs', 'club_members', 'club_invitations', 'seasons', 'teams', 'players',
    'team_players', 'matches', 'match_players', 'match_events'
  ] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row()',
      t
    );
  end loop;
end;
$$;

-- Dels perfils només interessen els canvis de superadministrador
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after update of is_superadmin on public.profiles
  for each row when (old.is_superadmin is distinct from new.is_superadmin)
  execute function public.audit_row();

-- ---------------------------------------------------------------------
-- Accions registrades des de l'aplicació
-- ---------------------------------------------------------------------
create or replace function public.log_action(
  p_action text,
  p_entity text,
  p_entity_id text default null,
  p_club uuid default null,
  p_summary text default null,
  p_details jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if p_action not in ('login', 'logout', 'export', 'import', 'upload', 'view') then
    raise exception 'bad_action';
  end if;
  if p_club is not null and not public.is_club_member(p_club) then
    raise exception 'not_allowed';
  end if;
  perform public.audit_write(p_action, left(p_entity, 40), left(p_entity_id, 80), p_club, p_summary, p_details);
  -- Neteja de les entrades antigues en cada inici de sessió
  if p_action = 'login' then
    perform public.audit_purge();
  end if;
end;
$$;

revoke all on function public.log_action(text, text, text, uuid, text, jsonb) from public, anon;
grant execute on function public.log_action(text, text, text, uuid, text, jsonb) to authenticated;

-- Esborra ara les entrades antigues (per al botó de la pantalla del registre)
create or replace function public.admin_purge_audit()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'not_allowed';
  end if;
  return public.audit_purge();
end;
$$;

revoke all on function public.admin_purge_audit() from public, anon;
grant execute on function public.admin_purge_audit() to authenticated;
