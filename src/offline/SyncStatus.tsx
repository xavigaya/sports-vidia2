import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { currentOps, discardFailed, flush, getOps, retryFailed, subscribe } from './outbox';

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

// Indicador de connexió i de canvis pendents d'enviar
export function SyncStatus() {
  const { t } = useTranslation();
  const online = useOnline();
  const [counts, setCounts] = useState({ pending: 0, failed: 0 });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => {
      const ops = currentOps();
      setCounts({ pending: ops.filter((o) => !o.error).length, failed: ops.filter((o) => o.error).length });
    };
    void getOps().then(update);
    return subscribe(update);
  }, []);

  if (online && counts.pending === 0 && counts.failed === 0) return null;

  const kind = counts.failed > 0 ? 'error' : !online ? 'offline' : 'syncing';
  return (
    <div className={`sync-status sync-${kind}`} role="status">
      <button className="sync-pill" onClick={() => setOpen((o) => !o)}>
        <span className="sync-dot" aria-hidden="true" />
        {!online ? t('offline.offline') : counts.failed > 0 ? t('offline.failedShort', { count: counts.failed }) : t('offline.syncing')}
        {counts.pending > 0 && <span className="sync-count">{t('offline.pending', { count: counts.pending })}</span>}
      </button>
      {open && (
        <div className="sync-panel card stack">
          <p className="small">{!online ? t('offline.offlineHelp') : t('offline.onlineHelp')}</p>
          {counts.failed > 0 && (
            <>
              <p className="small error-box">{t('offline.failedHelp', { count: counts.failed })}</p>
              <div className="row wrap">
                <button className="btn btn-sm" onClick={() => void retryFailed()}>
                  {t('offline.retry')}
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => {
                    if (window.confirm(t('offline.discardConfirm'))) void discardFailed();
                  }}
                >
                  {t('offline.discard')}
                </button>
              </div>
            </>
          )}
          {online && counts.pending > 0 && (
            <button className="btn btn-sm" onClick={() => void flush()}>
              {t('offline.syncNow')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
