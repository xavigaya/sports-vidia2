// Edició de les dades del partit (data, competició, lloc, àrbitres…)
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBox } from '../components/ui';
import type { UseMatch } from './useMatch';

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function MatchInfoForm({ m, onDone }: { m: UseMatch; onDone: () => void }) {
  const { t } = useTranslation();
  const match = m.match!;
  const [playedAt, setPlayedAt] = useState(toLocalInput(match.played_at));
  const [competition, setCompetition] = useState(match.competition ?? '');
  const [phase, setPhase] = useState(match.phase ?? '');
  const [venue, setVenue] = useState(match.venue ?? '');
  const [city, setCity] = useState(match.city ?? '');
  const [spectators, setSpectators] = useState(match.spectators != null ? String(match.spectators) : '');
  const [referees, setReferees] = useState(match.referees ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const n = spectators.trim() === '' ? null : Math.max(0, Math.round(Number(spectators)));
    const err = await m.updateMatch({
      played_at: playedAt ? new Date(playedAt).toISOString() : null,
      competition: competition.trim() || null,
      phase: phase.trim() || null,
      venue: venue.trim() || null,
      city: city.trim() || null,
      spectators: Number.isFinite(n) ? n : null,
      referees: referees.trim() || null,
    });
    setBusy(false);
    if (err) setError(err);
    else onDone();
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <div className="grid-2">
        <label className="field">
          <span>{t('matches.date')}</span>
          <input type="datetime-local" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('matches.competition')}</span>
          <input value={competition} onChange={(e) => setCompetition(e.target.value)} maxLength={120} />
        </label>
        <label className="field">
          <span>{t('matches.phase')}</span>
          <input value={phase} onChange={(e) => setPhase(e.target.value)} maxLength={60} />
        </label>
        <label className="field">
          <span>{t('matches.venue')}</span>
          <input value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={120} />
        </label>
        <label className="field">
          <span>{t('matchInfo.city')}</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
        </label>
        <label className="field">
          <span>{t('matchInfo.spectators')}</span>
          <input type="number" min={0} step={1} value={spectators} onChange={(e) => setSpectators(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>{t('matchInfo.referees')}</span>
        <input value={referees} onChange={(e) => setReferees(e.target.value)} maxLength={160} placeholder={t('matchInfo.refereesHint')} />
      </label>
      <p className="small muted">{t('matchInfo.coachesHint')}</p>
      {error && <ErrorBox message={error} />}
      <div className="row end">
        <button type="button" className="btn" onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
