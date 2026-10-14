// Exporta un partit de l'aplicació en format DataVolley (.dvw)
import type { UseMatch } from '../matches/useMatch';
import { rulesOf } from '../matches/useMatch';
import { downloadBlob, safeFilename } from '../lib/csv';
import { encodeLatin1, exportDvw } from './dvw';

export function downloadMatchDvw(m: UseMatch): Promise<void> {
  const match = m.match!;
  const players = (side: 'H' | 'A') =>
    m.players
      .filter((p) => p.side === side)
      .sort((a, b) => a.shirt_number - b.shirt_number)
      .map((p) => ({
        number: p.shirt_number,
        firstName: p.players.first_name,
        lastName: p.players.last_name,
        nickname: p.players.nickname ?? '',
        position: p.position,
        libero: p.is_libero,
      }));
  const text = exportDvw({
    date: match.played_at,
    season: '',
    league: match.competition ?? '',
    phase: match.phase ?? '',
    teams: [
      { code: match.home.code ?? '', name: match.home.name, coach: match.home.coach ?? '', assistant: match.home.assistant ?? '' },
      { code: match.away.code ?? '', name: match.away.name, coach: match.away.coach ?? '', assistant: match.away.assistant ?? '' },
    ],
    players: { H: players('H'), A: players('A') },
    events: m.events,
    rules: rulesOf(match),
    video: match.video_local_name ?? match.video_url ?? null,
  });
  const day = match.played_at ? match.played_at.slice(0, 10) : 'partit';
  const name = `${day} ${safeFilename(match.home.short_name ?? match.home.name)}-${safeFilename(match.away.short_name ?? match.away.name)}.dvw`;
  return downloadBlob(name, new Blob([encodeLatin1(text)], { type: 'text/plain;charset=windows-1252' }));
}
