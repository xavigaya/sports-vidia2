import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import type { Season, Team, TeamGender } from '../lib/types';
import { ErrorBox } from '../components/ui';

type TeamDraft = Omit<Team, 'id' | 'created_at'>;

interface Props {
  clubId: string;
  team?: Team | null;
  seasons: Season[];
  defaultOwn?: boolean;
  onSaved: (team: Team) => void;
  onSeasonCreated: () => void;
  onCancel: () => void;
}

export function TeamForm({ clubId, team, seasons, defaultOwn = true, onSaved, onSeasonCreated, onCancel }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<TeamDraft>(
    team ?? {
      club_id: clubId,
      season_id: seasons[0]?.id ?? null,
      name: '',
      short_name: null,
      code: null,
      category: null,
      gender: null,
      is_own: defaultOwn,
      coach: null,
      assistant: null,
      color: null,
      archived: false,
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof TeamDraft>(key: K, value: TeamDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const text = (v: string) => (v.trim() === '' ? null : v.trim());

  async function onNewSeason() {
    const name = window.prompt(t('teams.newSeason'), suggestSeasonName());
    if (!name?.trim()) return;
    const { data, error } = await supabase
      .from('seasons')
      .insert({ club_id: clubId, name: name.trim() })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    onSeasonCreated();
    set('season_id', (data as Season).id);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      ...draft,
      name: draft.name.trim(),
      code: draft.code ? draft.code.toUpperCase() : null,
    };
    const query = team
      ? supabase.from('teams').update(payload).eq('id', team.id).select().single()
      : supabase.from('teams').insert(payload).select().single();
    const { data, error } = await query;
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved(data as Team);
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <div className="grid-2">
        <label className="field">
          <span>{t('teams.name')}</span>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>{t('teams.shortName')}</span>
          <input value={draft.short_name ?? ''} onChange={(e) => set('short_name', text(e.target.value))} maxLength={12} />
        </label>
        <label className="field">
          <span>{t('teams.code')}</span>
          <input
            value={draft.code ?? ''}
            onChange={(e) => set('code', text(e.target.value))}
            maxLength={10}
            className="mono"
          />
        </label>
        <label className="field">
          <span>{t('teams.category')}</span>
          <input value={draft.category ?? ''} onChange={(e) => set('category', text(e.target.value))} />
        </label>
        <label className="field">
          <span>{t('teams.gender')}</span>
          <select value={draft.gender ?? ''} onChange={(e) => set('gender', (e.target.value || null) as TeamGender | null)}>
            <option value="">—</option>
            <option value="F">{t('teams.genderF')}</option>
            <option value="M">{t('teams.genderM')}</option>
            <option value="X">{t('teams.genderX')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('teams.season')}</span>
          <div className="row">
            <select
              className="grow"
              value={draft.season_id ?? ''}
              onChange={(e) => set('season_id', e.target.value || null)}
            >
              <option value="">{t('teams.noSeason')}</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-sm" onClick={() => void onNewSeason()} title={t('teams.newSeason')}>
              +
            </button>
          </div>
        </label>
        <label className="field">
          <span>{t('teams.coach')}</span>
          <input value={draft.coach ?? ''} onChange={(e) => set('coach', text(e.target.value))} />
        </label>
        <label className="field">
          <span>{t('teams.assistant')}</span>
          <input value={draft.assistant ?? ''} onChange={(e) => set('assistant', text(e.target.value))} />
        </label>
      </div>

      <div className="row wrap">
        <label className="check">
          <input type="checkbox" checked={draft.is_own} onChange={(e) => set('is_own', e.target.checked)} />
          {t('teams.isOwn')}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.color !== null}
            onChange={(e) => set('color', e.target.checked ? '#cc2936' : null)}
          />
          {t('teams.color')}
        </label>
        {draft.color && <input type="color" value={draft.color} onChange={(e) => set('color', e.target.value)} />}
        {team && (
          <label className="check">
            <input type="checkbox" checked={draft.archived} onChange={(e) => set('archived', e.target.checked)} />
            {t('teams.archived')}
          </label>
        )}
      </div>

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

function suggestSeasonName(): string {
  const now = new Date();
  // La temporada comença a l'agost
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}
