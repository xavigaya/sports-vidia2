import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/types';
import { ErrorBox } from '../components/ui';

type PlayerDraft = Omit<Player, 'id'>;

interface Props {
  clubId: string;
  player?: Player | null;
  onSaved: (player: Player) => void;
  onCancel: () => void;
}

export function emptyPlayer(clubId: string): PlayerDraft {
  return {
    club_id: clubId,
    first_name: '',
    last_name: '',
    nickname: null,
    external_code: null,
    is_minor: false,
    image_consent: false,
  };
}

export function PlayerFields({ draft, onChange }: { draft: PlayerDraft; onChange: (d: PlayerDraft) => void }) {
  const { t } = useTranslation();
  const set = <K extends keyof PlayerDraft>(k: K, v: PlayerDraft[K]) => onChange({ ...draft, [k]: v });
  const text = (v: string) => (v.trim() === '' ? null : v);
  return (
    <>
      <div className="grid-2">
        <label className="field">
          <span>{t('players.firstName')}</span>
          <input value={draft.first_name} onChange={(e) => set('first_name', e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>{t('players.lastName')}</span>
          <input value={draft.last_name} onChange={(e) => set('last_name', e.target.value)} />
        </label>
        <label className="field">
          <span>
            {t('players.nickname')} <em className="muted">({t('common.optional')})</em>
          </span>
          <input value={draft.nickname ?? ''} onChange={(e) => set('nickname', text(e.target.value))} maxLength={40} />
        </label>
        <label className="field">
          <span>
            {t('players.externalCode')} <em className="muted">({t('common.optional')})</em>
          </span>
          <input
            className="mono"
            value={draft.external_code ?? ''}
            onChange={(e) => set('external_code', text(e.target.value))}
            maxLength={20}
          />
        </label>
      </div>
      <div className="row wrap">
        <label className="check">
          <input type="checkbox" checked={draft.is_minor} onChange={(e) => set('is_minor', e.target.checked)} />
          {t('players.isMinor')}
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.image_consent} onChange={(e) => set('image_consent', e.target.checked)} />
          {t('players.imageConsent')}
        </label>
      </div>
      <small className="muted">{t('players.imageConsentHelp')}</small>
    </>
  );
}

export function PlayerForm({ clubId, player, onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PlayerDraft>(player ?? emptyPlayer(clubId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      ...draft,
      first_name: draft.first_name.trim(),
      last_name: draft.last_name.trim(),
      nickname: draft.nickname?.trim() || null,
      external_code: draft.external_code?.trim() || null,
    };
    const q = player
      ? supabase.from('players').update(payload).eq('id', player.id).select().single()
      : supabase.from('players').insert(payload).select().single();
    const { data, error } = await q;
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved(data as Player);
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <PlayerFields draft={draft} onChange={setDraft} />
      <p className="privacy small">{t('players.privacyNote')}</p>
      {error && <ErrorBox message={error} />}
      <div className="row end">
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
