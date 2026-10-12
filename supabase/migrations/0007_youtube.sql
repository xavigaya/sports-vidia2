-- =====================================================================
-- Sports VidIA 2 — Pujada de vídeos a YouTube (fase 8)
-- =====================================================================
-- Compte i llista de reproducció de YouTube on el club puja els vídeos.
-- L'ID de client OAuth de Google és públic (no és cap secret).
alter table public.clubs
  add column if not exists youtube_client_id text check (char_length(youtube_client_id) <= 200),
  add column if not exists youtube_playlist_id text check (char_length(youtube_playlist_id) <= 100),
  add column if not exists youtube_privacy text not null default 'unlisted'
    check (youtube_privacy in ('private', 'unlisted', 'public'));
