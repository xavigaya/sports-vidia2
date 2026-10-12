-- =====================================================================
-- Sports VidIA 2 — Vídeo del partit (fase 4)
-- =====================================================================

-- Vídeo associat al partit: enllaç de YouTube, o nom del fitxer local
-- (el fitxer no es puja: cada dispositiu el tria del seu disc).
alter table public.matches
  add column if not exists video_url text check (char_length(video_url) <= 300),
  add column if not exists video_local_name text check (char_length(video_local_name) <= 255);

-- Sincronitza un partit codificat sense vídeo (p. ex. en directe):
-- es diu quin instant del vídeo correspon a una acció i la resta
-- d'accions es col·loquen segons l'hora en què es van codificar.
create or replace function public.sync_match_video(p_match uuid, p_seq integer, p_time double precision, p_only_missing boolean default true)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor timestamptz;
  v_count integer;
begin
  if not public.can_code_match(p_match) then
    raise exception 'not_allowed';
  end if;
  select created_at into v_anchor from public.match_events where match_id = p_match and seq = p_seq;
  if v_anchor is null then
    raise exception 'event_not_found';
  end if;
  update public.match_events
     set video_time = greatest(0, p_time + extract(epoch from (created_at - v_anchor)))
   where match_id = p_match
     and (not p_only_missing or video_time is null or seq = p_seq);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.sync_match_video(uuid, integer, double precision, boolean) from public, anon;
grant execute on function public.sync_match_video(uuid, integer, double precision, boolean) to authenticated;
