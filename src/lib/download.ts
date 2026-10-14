// =====================================================================
// Desar fitxers generats per l'aplicació (PDF, Excel, DataVolley, CSV)
//
//  * Navegador i escriptori: descàrrega normal.
//  * Android: el WebView no fa descàrregues de fitxers creats a la pàgina,
//    així que el fitxer es desa a la memòria cau de l'aplicació i s'obre el
//    menú "Compartir" del sistema (desar a Fitxers o Drive, enviar per
//    correu o WhatsApp…).
// =====================================================================
import { Capacitor, registerPlugin } from '@capacitor/core';

interface FilesystemPlugin {
  writeFile(o: { path: string; data: string; directory: 'CACHE' | 'DOCUMENTS' | 'DATA'; recursive?: boolean }): Promise<{ uri: string }>;
}
interface SharePlugin {
  share(o: { title?: string; text?: string; files?: string[]; dialogTitle?: string }): Promise<unknown>;
}

const Filesystem = registerPlugin<FilesystemPlugin>('Filesystem');
const Share = registerPlugin<SharePlugin>('Share');

function isAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('read'));
    r.readAsDataURL(blob);
  });
}

function browserDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function saveFile(filename: string, blob: Blob): Promise<void> {
  if (!isAndroidApp()) {
    browserDownload(filename, blob);
    return;
  }
  const data = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({ path: `exports/${filename}`, data, directory: 'CACHE', recursive: true });
  try {
    await Share.share({ title: filename, files: [uri], dialogTitle: filename });
  } catch (e) {
    // Tancar el menú sense triar res no és un error
    if (!/cancel/i.test((e as Error).message ?? '')) throw e;
  }
}
