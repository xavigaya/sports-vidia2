import { createClient } from '@supabase/supabase-js';

// Configuració del servidor: primer la de la compilació (.env); si no n'hi ha
// (p. ex. en les aplicacions instal·lables), la que l'usuari ha introduït.
const CONFIG_KEY = 'svidia.server';

interface ServerConfig {
  url: string;
  key: string;
}

function storedConfig(): ServerConfig | null {
  try {
    const v = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null') as ServerConfig | null;
    return v && typeof v.url === 'string' && typeof v.key === 'string' ? v : null;
  } catch {
    return null;
  }
}

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const stored = storedConfig();
const url = envUrl || stored?.url;
const anonKey = envKey || stored?.key;

export const supabaseConfigured = Boolean(url && anonKey);
export const serverFromBuild = Boolean(envUrl && envKey);
export const serverUrl = url ?? null;

export function saveServerConfig(cfg: ServerConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: cfg.url.trim().replace(/\/+$/, ''), key: cfg.key.trim() }));
  } catch {
    /* sense emmagatzematge */
  }
}

export function clearServerConfig() {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* sense emmagatzematge */
  }
}

// Si falta la configuració, es crea un client fictici perquè l'aplicació
// pugui mostrar la pantalla de configuració en lloc de petar.
export const supabase = createClient(url ?? 'https://not-configured.supabase.co', anonKey ?? 'not-configured', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const LOGO_BUCKET = 'club-logos';

export function publicLogoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Entorn d'execució: navegador, aplicació d'escriptori (Tauri) o Android (Capacitor)
export function runtimePlatform(): 'web' | 'desktop' | 'android' {
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown; Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.__TAURI_INTERNALS__) return 'desktop';
  if (w.Capacitor?.isNativePlatform?.()) return 'android';
  return 'web';
}
