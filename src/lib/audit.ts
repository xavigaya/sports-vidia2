// Registre d'accions fetes des de l'aplicació (inicis de sessió, exportacions,
// importacions, pujades). Els canvis de dades ja els registra la base de dades.
// No bloqueja mai l'usuari: si falla (sense connexió…), s'ignora.
import { supabase } from './supabase';

let currentClub: string | null = null;

export function setAuditClub(id: string | null) {
  currentClub = id;
}

export type ClientAction = 'login' | 'logout' | 'export' | 'import' | 'upload';

export function logAction(
  action: ClientAction,
  entity: string,
  o: { entityId?: string | null; summary?: string | null; details?: Record<string, unknown> | null; clubId?: string | null } = {},
) {
  try {
    void supabase
      .rpc('log_action', {
        p_action: action,
        p_entity: entity,
        p_entity_id: o.entityId ?? null,
        p_club: o.clubId === undefined ? currentClub : o.clubId,
        p_summary: o.summary ?? null,
        p_details: o.details ?? null,
      })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    /* sense registre */
  }
}
