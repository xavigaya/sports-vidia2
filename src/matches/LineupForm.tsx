import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { playerDisplayName, type MatchPlayer, type SideCode } from '../lib/types';
import type { Side, TeamLineup } from '../engine/match';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

interface Props {
  setNumber: number;
  isTiebreak: boolean;
  players: MatchPlayer[];
  teamNames: Record<SideCode, string>;
  initial: { home: TeamLineup; away: TeamLineup; serving: Side } | null;
  onSubmit: (v: { home: TeamLineup; away: TeamLineup; serving: Side }) => Promise<string | null>;
  onCancel: () => void;
}

function blank(players: MatchPlayer[], side: SideCode): TeamLineup {
  return { positions: [-1, -1, -1, -1, -1, -1], liberos: players.filter((p) => p.side === side && p.is_libero).map((p) => p.shirt_number) };
}

export function LineupForm({ setNumber, isTiebreak, players, teamNames, initial, onSubmit, onCancel }: Props) {
  const { t } = useTranslation();
  const [home, setHome] = useState<TeamLineup>(initial?.home ?? blank(players, 'H'));
  const [away, setAway] = useState<TeamLineup>(initial?.away ?? blank(players, 'A'));
  const [serving, setServing] = useState<Side>(initial?.serving ?? 'H');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bySide = useMemo(
    () => ({
      H: players.filter((p) => p.side === 'H'),
      A: players.filter((p) => p.side === 'A'),
    }),
    [players],
  );

  function teamBlock(side: SideCode, value: TeamLineup, setValue: (v: TeamLineup) => void) {
    const list = bySide[side];
    const field = list.filter((p) => !value.liberos.includes(p.shirt_number));
    const liberoCandidates = list.filter((p) => p.is_libero || value.liberos.includes(p.shirt_number));
    const used = new Set(value.positions);
    return (
      <fieldset className="lineup-team card">
        <legend>{teamNames[side]}</legend>
        {list.length === 0 && <p className="warn small">{t('matches.noPlayersCalled')}</p>}
        <div className="lineup-grid">
          {/* Disposició com al camp: IV III II a dalt, V VI I a baix */}
          {[3, 2, 1, 4, 5, 0].map((idx) => (
            <label key={idx} className="field lineup-slot">
              <span>{ROMAN[idx]}</span>
              <select
                value={value.positions[idx]}
                onChange={(e) => {
                  const positions = [...value.positions];
                  positions[idx] = Number(e.target.value);
                  setValue({ ...value, positions });
                }}
                required
              >
                <option value={-1}>—</option>
                {field.map((p) => (
                  <option
                    key={p.player_id}
                    value={p.shirt_number}
                    disabled={used.has(p.shirt_number) && value.positions[idx] !== p.shirt_number}
                  >
                    {p.shirt_number} · {playerDisplayName(p.players)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {liberoCandidates.length > 0 && (
          <div className="row wrap">
            <span className="small muted">{t('positions.L')}:</span>
            {liberoCandidates.map((p) => (
              <label key={p.player_id} className="check">
                <input
                  type="checkbox"
                  checked={value.liberos.includes(p.shirt_number)}
                  disabled={!value.liberos.includes(p.shirt_number) && value.liberos.length >= 2}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      liberos: e.target.checked
                        ? [...value.liberos, p.shirt_number]
                        : value.liberos.filter((n) => n !== p.shirt_number),
                      positions: value.positions.map((n) => (e.target.checked && n === p.shirt_number ? -1 : n)),
                    })
                  }
                />
                <span className="mono">{p.shirt_number}</span> {playerDisplayName(p.players)}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if ([...home.positions, ...away.positions].some((n) => n < 0)) {
      setError(t('live.lineupIncomplete'));
      return;
    }
    setBusy(true);
    setError(await onSubmit({ home, away, serving }));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="stack">
      <p className="muted small">
        {t('live.lineupHelp', { set: setNumber })}
        {isTiebreak && <> {t('live.tiebreakToss')}</>}
      </p>
      <div className="grid-2">
        {teamBlock('H', home, setHome)}
        {teamBlock('A', away, setAway)}
      </div>
      <div className="row wrap">
        <span className="field-label">{t('live.firstServe')}:</span>
        <div className="segmented">
          {(['H', 'A'] as Side[]).map((s) => (
            <button key={s} type="button" className={serving === s ? 'on' : ''} onClick={() => setServing(s)}>
              {teamNames[s]}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="row end">
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {t('live.startSet', { set: setNumber })}
        </button>
      </div>
    </form>
  );
}
