import { useTranslation } from 'react-i18next';
import { onCourt, type TeamState } from '../engine/match';
import { playerDisplayName, type MatchPlayer } from '../lib/types';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

// Ordre de les cel·les (de dalt a baix, d'esquerra a dreta) segons on
// és la xarxa. Índex = posició - 1.
const LEFT_OF_NET = [4, 3, 5, 2, 0, 1]; // zaga (V,VI,I) | davantera (IV,III,II)
const RIGHT_OF_NET = [1, 0, 2, 5, 3, 4]; // davantera (II,III,IV) | zaga (I,VI,V)

interface Props {
  team: TeamState;
  players: Map<number, MatchPlayer>;
  serving: boolean;
  netOnRight: boolean;
  color: string;
  onPlayerClick?: (number: number) => void;
}

export function Court({ team, players, serving, netOnRight, color, onPlayerClick }: Props) {
  const { t } = useTranslation();
  const court = onCourt(team);
  const order = netOnRight ? LEFT_OF_NET : RIGHT_OF_NET;

  return (
    <div className={`court ${netOnRight ? 'net-right' : 'net-left'}`} style={{ ['--team' as string]: color }}>
      {order.map((idx) => {
        const n = court[idx];
        const p = players.get(n);
        const isLibero = team.liberos.includes(n);
        const isServer = serving && idx === 0;
        return (
          <button
            key={idx}
            type="button"
            className={`court-cell ${isLibero ? 'libero' : ''} ${isServer ? 'server' : ''}`}
            onClick={onPlayerClick ? () => onPlayerClick(n) : undefined}
            disabled={!onPlayerClick}
            title={p ? playerDisplayName(p.players) : undefined}
          >
            <span className="court-pos">{ROMAN[idx]}</span>
            <span className="court-num mono">{n ?? '–'}</span>
            <span className="court-name">{p ? shortName(p) : ''}</span>
            {isServer && (
              <span className="court-serve" aria-label={t('live.serving')}>
                ●
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function shortName(p: MatchPlayer): string {
  const pl = p.players;
  if (pl.nickname) return pl.nickname;
  return pl.last_name ? `${pl.first_name.charAt(0)}. ${pl.last_name.split(' ')[0]}` : pl.first_name;
}
