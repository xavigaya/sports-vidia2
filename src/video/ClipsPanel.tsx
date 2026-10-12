import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { EVALUATIONS, SKILLS, actionCode, type Evaluation, type Skill } from '../engine/actions';
import type { MatchEvent, MatchState, Side } from '../engine/match';
import { playerDisplayName, type MatchPlayer, type SideCode } from '../lib/types';
import { buildClips, EMPTY_FILTER, type ClipFilter } from './clips';
import { formatTime } from './youtube';
import type { PlayerHandle } from './VideoPlayer';

interface Props {
  events: MatchEvent[];
  rules: MatchState['rules'];
  playerRef: RefObject<PlayerHandle | null>;
  names: Record<SideCode, string>;
  players: Record<SideCode, Map<number, MatchPlayer>>;
  initialFilter?: ClipFilter | null;
}

const MARGIN_KEY = 'svidia.clipMargins';

function readMargins(): { pre: number; post: number } {
  try {
    const v = JSON.parse(localStorage.getItem(MARGIN_KEY) ?? '');
    if (typeof v.pre === 'number' && typeof v.post === 'number') return v;
  } catch {
    /* valors per defecte */
  }
  return { pre: 5, post: 2 };
}

// Vídeos filtrats: llista de talls i reproducció seguida
export function ClipsPanel({ events, rules, playerRef, names, players, initialFilter }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ClipFilter>(initialFilter ?? EMPTY_FILTER);
  // Filtre que arriba des de les estadístiques
  const initialKey = initialFilter ? JSON.stringify(initialFilter) : '';
  useEffect(() => {
    if (initialKey) setFilter(JSON.parse(initialKey) as ClipFilter);
  }, [initialKey]);
  const [margins, setMargins] = useState(readMargins);
  const [current, setCurrent] = useState<number | null>(null); // índex del tall en reproducció
  const [playlist, setPlaylist] = useState(false); // reproduint tots seguits
  const timer = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(MARGIN_KEY, JSON.stringify(margins));
    } catch {
      /* sense emmagatzematge */
    }
  }, [margins]);

  const clips = useMemo(() => buildClips(events, rules, filter, margins.pre, margins.post), [events, rules, filter, margins]);
  const sets = useMemo(() => [...new Set(events.map((e) => e.set))].filter((n) => n > 0).sort(), [events]);

  // Control de la reproducció: quan s'arriba al final del tall, passa al següent o s'atura
  useEffect(() => {
    if (current === null) return;
    const clip = clips[current];
    if (!clip) {
      setCurrent(null);
      return;
    }
    timer.current = window.setInterval(() => {
      const now = playerRef.current?.getTime();
      if (now == null) return;
      if (now >= clip.end) {
        if (playlist && current + 1 < clips.length) {
          const next = clips[current + 1];
          playerRef.current?.seek(next.start);
          setCurrent(current + 1);
        } else {
          playerRef.current?.pause();
          setCurrent(null);
          setPlaylist(false);
        }
      }
    }, 200);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [current, playlist, clips, playerRef]);

  function playClip(i: number, all: boolean) {
    const clip = clips[i];
    if (!clip) return;
    setPlaylist(all);
    setCurrent(i);
    playerRef.current?.seek(clip.start);
    playerRef.current?.play();
  }

  function stop() {
    playerRef.current?.pause();
    setCurrent(null);
    setPlaylist(false);
  }

  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const sidePlayers = filter.side ? [...players[filter.side].values()].sort((a, b) => a.shirt_number - b.shirt_number) : [];

  return (
    <section className="card clips stack">
      <div className="row between wrap">
        <h2>{t('clips.title')}</h2>
        <span className="muted small">{t('clips.count', { count: clips.length })}</span>
      </div>

      <div className="clip-filters">
        <div className="row wrap">
          <select
            value={filter.side ?? ''}
            onChange={(e) => setFilter({ ...filter, side: (e.target.value || null) as Side | null, player: null })}
            aria-label={t('clips.team')}
          >
            <option value="">{t('clips.allTeams')}</option>
            <option value="H">{names.H}</option>
            <option value="A">{names.A}</option>
          </select>
          <select
            value={filter.player ?? ''}
            disabled={!filter.side}
            onChange={(e) => setFilter({ ...filter, player: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label={t('clips.player')}
          >
            <option value="">{t('clips.allPlayers')}</option>
            {sidePlayers.map((p) => (
              <option key={p.player_id} value={p.shirt_number}>
                {p.shirt_number} · {playerDisplayName(p.players)}
              </option>
            ))}
          </select>
          <select
            value={filter.set ?? ''}
            onChange={(e) => setFilter({ ...filter, set: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label={t('clips.set')}
          >
            <option value="">{t('clips.allSets')}</option>
            {sets.map((n) => (
              <option key={n} value={n}>
                {t('live.setN', { n })}
              </option>
            ))}
          </select>
          <label className="check small">
            <input type="checkbox" checked={filter.pointsOnly} onChange={(e) => setFilter({ ...filter, pointsOnly: e.target.checked })} />
            {t('clips.pointsOnly')}
          </label>
        </div>
        <div className="chip-row">
          {SKILLS.map((s: Skill) => (
            <button
              key={s}
              className={`chip-btn ${filter.skills.includes(s) ? 'on' : ''}`}
              onClick={() => setFilter({ ...filter, skills: toggleIn(filter.skills, s) })}
              title={t(`skills.${s}`)}
            >
              <span className="mono">{s}</span> {t(`skills.${s}`)}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {EVALUATIONS.map((ev: Evaluation) => (
            <button
              key={ev}
              className={`chip-btn mono ${filter.evaluations.includes(ev) ? 'on' : ''}`}
              onClick={() => setFilter({ ...filter, evaluations: toggleIn(filter.evaluations, ev) })}
            >
              {ev}
            </button>
          ))}
          {(filter !== EMPTY_FILTER) && (
            <button className="btn-link small" onClick={() => setFilter(EMPTY_FILTER)}>
              {t('clips.clear')}
            </button>
          )}
        </div>
        <div className="row wrap small">
          <label className="row">
            {t('clips.before')}
            <input
              type="number"
              min={0}
              max={30}
              value={margins.pre}
              onChange={(e) => setMargins({ ...margins, pre: Math.max(0, Number(e.target.value)) })}
              className="num-input"
            />
          </label>
          <label className="row">
            {t('clips.after')}
            <input
              type="number"
              min={0}
              max={30}
              value={margins.post}
              onChange={(e) => setMargins({ ...margins, post: Math.max(0, Number(e.target.value)) })}
              className="num-input"
            />
          </label>
        </div>
      </div>

      <div className="row wrap">
        <button className="btn btn-primary" disabled={clips.length === 0} onClick={() => playClip(0, true)}>
          ▶ {t('clips.playAll')}
        </button>
        {current !== null && (
          <>
            <button className="btn" disabled={current === 0} onClick={() => playClip(current - 1, playlist)}>
              ⏮
            </button>
            <button className="btn" disabled={current + 1 >= clips.length} onClick={() => playClip(current + 1, playlist)}>
              ⏭
            </button>
            <button className="btn" onClick={stop}>
              ⏹
            </button>
            <span className="small muted">
              {current + 1} / {clips.length}
            </span>
          </>
        )}
      </div>

      {clips.length === 0 ? (
        <p className="muted small">{t('clips.none')}</p>
      ) : (
        <ol className="clip-list">
          {clips.map((c, i) => (
            <li key={c.seq} className={current === i ? 'playing' : ''}>
              <button className="clip-row" onClick={() => playClip(i, false)}>
                <span className="mono small muted">S{c.set} {c.scoreH}-{c.scoreA}</span>
                <span className="mono">{actionCode(c.ev)}</span>
                <span className="small clip-name">{playerName(players, c.ev.side, c.ev.player)}</span>
                <span className="mono small muted">{formatTime(c.time)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function playerName(players: Record<SideCode, Map<number, MatchPlayer>>, side: Side, n: number): string {
  const p = players[side].get(n);
  return p ? playerDisplayName(p.players) : '';
}
