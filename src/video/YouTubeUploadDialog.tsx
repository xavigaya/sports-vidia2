import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, runtimePlatform } from '../lib/supabase';
import { useCurrentClub } from '../club/ClubProvider';
import { playerDisplayName, type Player } from '../lib/types';
import type { UseMatch } from '../matches/useMatch';
import { addToPlaylist, authorizeYouTube, uploadVideo, type Privacy } from './youtubeUpload';

type Step = 'form' | 'uploading' | 'done';

export function YouTubeUploadDialog({ m, file, onClose }: { m: UseMatch; file: File; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const club = useCurrentClub();
  const match = m.match!;
  const date = match.played_at ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(match.played_at)) : '';
  const [title, setTitle] = useState(`${match.home.name} – ${match.away.name}${date ? ` · ${date}` : ''}`);
  const [description, setDescription] = useState([match.competition, match.phase, match.venue].filter(Boolean).join(' · '));
  const [privacy, setPrivacy] = useState<Privacy>(club.youtube_privacy ?? 'unlisted');
  const [step, setStep] = useState<Step>('form');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [people, setPeople] = useState<Player[]>([]);
  const [ackAdults, setAckAdults] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // Consentiments d'imatge dels jugadors dels equips del club que hi apareixen
  const ownSides = useMemo(() => (['H', 'A'] as const).filter((s) => (s === 'H' ? match.home.is_own : match.away.is_own)), [match]);
  useEffect(() => {
    const ids = m.players.filter((p) => (ownSides as readonly string[]).includes(p.side)).map((p) => p.player_id);
    if (ids.length === 0) return;
    void supabase
      .from('players')
      .select('*')
      .in('id', ids)
      .then(({ data }) => setPeople((data ?? []) as Player[]));
  }, [m.players, ownSides]);
  const minorsNoConsent = people.filter((p) => p.is_minor && !p.image_consent);
  const adultsNoConsent = people.filter((p) => !p.is_minor && !p.image_consent);

  const platform = runtimePlatform();
  const clientId = club.youtube_client_id;
  const blocked = !clientId || platform !== 'web' || minorsNoConsent.length > 0 || (adultsNoConsent.length > 0 && !ackAdults);

  async function start() {
    if (!clientId) return;
    setError(null);
    setWarning(null);
    try {
      const token = await authorizeYouTube(clientId);
      setStep('uploading');
      abort.current = new AbortController();
      const id = await uploadVideo({ token, file, title, description, privacy, onProgress: setProgress, signal: abort.current.signal });
      setVideoId(id);
      if (club.youtube_playlist_id) {
        try {
          await addToPlaylist(token, club.youtube_playlist_id, id);
        } catch (e) {
          setWarning(t('youtube.playlistFailed', { message: (e as Error).message }));
        }
      }
      await m.saveVideo({ video_url: `https://youtu.be/${id}` });
      setStep('done');
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg === 'aborted' ? t('youtube.cancelled') : t('youtube.failed', { message: msg }));
      setStep('form');
    }
  }

  if (step === 'done' && videoId) {
    return (
      <div className="stack">
        <div className="notice">{t('youtube.done')}</div>
        <a href={`https://youtu.be/${videoId}`} target="_blank" rel="noreferrer" className="mono">
          https://youtu.be/{videoId}
        </a>
        {warning && <div className="error-box small">{warning}</div>}
        {privacy !== 'private' && <p className="small muted">{t('youtube.privateNote')}</p>}
        <div className="row end">
          <button className="btn btn-primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'uploading') {
    return (
      <div className="stack">
        <p>{t('youtube.uploading', { name: file.name })}</p>
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="small muted mono">
          {Math.round(progress * 100)}% · {(file.size / 1024 / 1024 / 1024).toFixed(2)} GB
        </p>
        <p className="small muted">{t('youtube.keepOpen')}</p>
        <div className="row end">
          <button className="btn" onClick={() => abort.current?.abort()}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {!clientId && <div className="notice">{t('youtube.notConfigured')}</div>}
      {platform !== 'web' && <div className="notice">{t('youtube.webOnly')}</div>}

      {minorsNoConsent.length > 0 && (
        <div className="error-box small">
          {t('youtube.minorsBlocked')}
          <ul>
            {minorsNoConsent.map((p) => (
              <li key={p.id}>{playerDisplayName(p)}</li>
            ))}
          </ul>
        </div>
      )}
      {adultsNoConsent.length > 0 && (
        <div className="notice small stack">
          <span>{t('youtube.adultsWarning', { list: adultsNoConsent.map((p) => playerDisplayName(p)).join(', ') })}</span>
          <label className="check">
            <input type="checkbox" checked={ackAdults} onChange={(e) => setAckAdults(e.target.checked)} />
            {t('youtube.adultsAck')}
          </label>
        </div>
      )}
      <p className="small muted">{t('youtube.rivalNote')}</p>

      <label className="field">
        <span>{t('youtube.videoTitle')}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
      </label>
      <label className="field">
        <span>{t('youtube.description')}</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </label>
      <label className="field">
        <span>{t('youtube.privacy')}</span>
        <select value={privacy} onChange={(e) => setPrivacy(e.target.value as Privacy)}>
          <option value="unlisted">{t('youtube.unlisted')}</option>
          <option value="private">{t('youtube.private')}</option>
          <option value="public">{t('youtube.public')}</option>
        </select>
      </label>
      <p className="small muted">
        {file.name} · {(file.size / 1024 / 1024).toFixed(0)} MB
      </p>
      {error && <div className="error-box">{error}</div>}
      <div className="row end">
        <button className="btn" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" disabled={blocked} onClick={() => void start()}>
          {t('youtube.upload')}
        </button>
      </div>
    </div>
  );
}
