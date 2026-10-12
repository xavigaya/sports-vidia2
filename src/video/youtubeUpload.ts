// =====================================================================
// Pujada de vídeos a YouTube (API de dades v3)
//
// 1. Autorització amb el compte de Google del club (Google Identity
//    Services, finestra emergent). Cal un "ID de client OAuth" creat a
//    Google Cloud, configurat a la Configuració del club.
// 2. Pujada "reprenible" per blocs, amb progrés.
// 3. El vídeo s'afegeix a la llista de reproducció configurada.
// =====================================================================

const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleAccounts {
  oauth2: {
    initTokenClient(cfg: {
      client_id: string;
      scope: string;
      callback: (r: TokenResponse) => void;
      error_callback?: (e: { type: string; message?: string }) => void;
    }): { requestAccessToken(opts?: { prompt?: string }): void };
  };
}

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

let gisPromise: Promise<GoogleAccounts> | null = null;

function loadGis(): Promise<GoogleAccounts> {
  if (window.google?.accounts) return Promise.resolve(window.google.accounts);
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google?.accounts ? resolve(window.google.accounts) : reject(new Error('gis')));
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('gis'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

// Demana permís al compte de Google (obre una finestra emergent)
export async function authorizeYouTube(clientId: string): Promise<string> {
  const accounts = await loadGis();
  return new Promise((resolve, reject) => {
    const client = accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error_description || r.error || 'oauth'))),
      error_callback: (e) => reject(new Error(e.message || e.type)),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export type Privacy = 'private' | 'unlisted' | 'public';

export interface UploadOptions {
  token: string;
  file: File;
  title: string;
  description: string;
  privacy: Privacy;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const CHUNK = 8 * 1024 * 1024; // múltiple de 256 KB

// Inicia la sessió de pujada i retorna l'adreça on enviar el fitxer
async function startSession(o: UploadOptions): Promise<string> {
  const res = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${o.token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': o.file.type || 'video/*',
      'X-Upload-Content-Length': String(o.file.size),
    },
    body: JSON.stringify({
      snippet: { title: o.title.slice(0, 100), description: o.description.slice(0, 5000), categoryId: '17' }, // 17 = Esports
      status: { privacyStatus: o.privacy, selfDeclaredMadeForKids: false },
    }),
    signal: o.signal,
  });
  if (!res.ok) throw new Error(await apiError(res));
  const loc = res.headers.get('Location');
  if (!loc) throw new Error('no_upload_url');
  return loc;
}

async function apiError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
    return j.error?.errors?.[0]?.reason ?? j.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// Envia un bloc amb XMLHttpRequest (per tenir el progrés)
function putChunk(url: string, token: string, blob: Blob, start: number, total: number, onProgress: (loaded: number) => void, signal?: AbortSignal) {
  return new Promise<{ status: number; body: string; range: string | null }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Un bloc buit serveix per preguntar quant n'ha rebut el servidor
    xhr.setRequestHeader('Content-Range', blob.size === 0 ? `bytes */${total}` : `bytes ${start}-${start + blob.size - 1}/${total}`);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText, range: xhr.getResponseHeader('Range') });
    xhr.onerror = () => reject(new Error('network'));
    xhr.onabort = () => reject(new Error('aborted'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(blob);
  });
}

// Puja el fitxer i retorna l'identificador del vídeo
export async function uploadVideo(o: UploadOptions): Promise<string> {
  const url = await startSession(o);
  const total = o.file.size;
  let offset = 0;
  let retries = 0;
  while (offset < total) {
    const end = Math.min(offset + CHUNK, total);
    try {
      const r = await putChunk(url, o.token, o.file.slice(offset, end), offset, total, (l) => o.onProgress?.((offset + l) / total), o.signal);
      if (r.status === 200 || r.status === 201) {
        o.onProgress?.(1);
        return (JSON.parse(r.body) as { id: string }).id;
      }
      if (r.status === 308) {
        // Bloc rebut: el servidor indica fins on té el fitxer
        const m = r.range ? /bytes=0-(\d+)/.exec(r.range) : null;
        offset = m ? Number(m[1]) + 1 : end;
        retries = 0;
        continue;
      }
      if (r.status >= 500 && retries < 5) throw new Error('retry');
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (o.signal?.aborted) throw new Error('aborted');
      if (retries >= 5) throw e;
      retries += 1;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** retries));
      // Es pregunta al servidor quant ha rebut abans de continuar
      const status = await putChunk(url, o.token, new Blob([]), 0, total, () => undefined).catch(() => null);
      if (status?.status === 308) {
        const m = status.range ? /bytes=0-(\d+)/.exec(status.range) : null;
        offset = m ? Number(m[1]) + 1 : 0;
      }
    }
  }
  throw new Error('incomplete');
}

export async function addToPlaylist(token: string, playlistId: string, videoId: string): Promise<void> {
  const res = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }),
  });
  if (!res.ok) throw new Error(await apiError(res));
}

// Accepta l'identificador de la llista o un enllaç que el contingui (…?list=PL…)
export function parsePlaylistId(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const m = /[?&]list=([\w-]+)/.exec(s);
  if (m) return m[1];
  return /^[\w-]{10,64}$/.test(s) ? s : null;
}
