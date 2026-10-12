-- =====================================================================
-- Volei VidIA — Partits importats (fase 6)
-- =====================================================================

-- Els partits importats (p. ex. de DataVolley) no validen qui és al camp
-- en cada acció, perquè els líberos i alguns canvis hi consten implícits.
alter table public.matches
  add column if not exists lenient_actions boolean not null default false,
  add column if not exists imported_from text check (char_length(imported_from) <= 40);
