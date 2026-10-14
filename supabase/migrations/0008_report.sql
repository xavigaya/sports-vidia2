-- =====================================================================
-- Volei VidIA — Dades per a l'informe del partit
-- Ciutat, espectadors i àrbitres (opcionals). El pavelló ja és "venue".
-- =====================================================================

alter table public.matches
  add column if not exists city text,
  add column if not exists spectators integer check (spectators is null or spectators >= 0),
  add column if not exists referees text;
