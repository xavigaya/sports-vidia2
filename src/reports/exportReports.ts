// Generació i desat dels informes PDF (partit i acumulat)
import type { TFunction } from 'i18next';
import type { Side } from '../engine/match';
import { playerDisplayName, type MatchPlayer, type MatchWithTeams } from '../lib/types';
import { safeFilename } from '../lib/csv';
import { saveFile } from '../lib/download';
import { PdfDocument } from '../pdf/pdf';
import type { UseMatch } from '../matches/useMatch';
import { rulesOf } from '../matches/useMatch';
import { computeMatchStats, type SkillCounts } from '../stats/compute';
import { drawGeneralStats, type GsHeader, type GsLabels, type GsRow, type GsTeam } from './generalStatsPdf';
import { drawMatchReport, type MrLabels, type MrTeam } from './matchReportPdf';
import { computeMatchReport } from './reportData';

const pad = (n: number) => String(n).padStart(2, '0');
export function dateParts(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  return { date: `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function today(): string {
  return dateParts(new Date().toISOString()).date;
}

export function settersOf(players: Pick<MatchPlayer, 'side' | 'position' | 'shirt_number'>[]): Record<Side, number[]> {
  return {
    H: players.filter((p) => p.side === 'H' && p.position === 'S').map((p) => p.shirt_number),
    A: players.filter((p) => p.side === 'A' && p.position === 'S').map((p) => p.shirt_number),
  };
}

export function generalLabels(t: TFunction): GsLabels {
  return {
    title: t('report.general'),
    skills: { S: t('skills.S'), R: t('skills.R'), A: t('skills.A'), B: t('skills.B') },
    total: t('report.tot'),
    team: t('report.team'),
    footer: t('report.footer', { date: today() }),
    page: (n, total) => t('report.page', { n, total }),
  };
}

export function reportLabels(t: TFunction): MrLabels {
  const r = (k: string) => t(`report.${k}`);
  return {
    title: r('matchReport'),
    date: r('date'),
    time: r('time'),
    city: r('city'),
    hall: r('hall'),
    spectators: r('spectators'),
    referees: r('referees'),
    set: r('set'),
    duration: r('duration'),
    partials: r('partials'),
    points: r('points'),
    serve: t('skills.S'),
    reception: t('skills.R'),
    attack: t('skills.A'),
    block: r('blockShort'),
    tot: r('tot'),
    bp: r('bp'),
    wl: r('wl'),
    err: r('err'),
    pts: r('pts'),
    pos: r('pos'),
    exc: r('exc'),
    blocked: r('blocked'),
    ptsPct: r('ptsPct'),
    teamTotals: r('teamTotals'),
    pointsWon: r('pointsWon'),
    pwServe: r('pwServe'),
    pwAttack: r('pwAttack'),
    pwBlock: r('pwBlock'),
    pwOpp: r('pwOpp'),
    setN: (n) => t('report.setN', { n }),
    coach: r('coach'),
    assistant: r('assistant'),
    libero: r('libero'),
    captain: r('captain'),
    legend: r('legend'),
    legendStarter: r('legendStarter'),
    legendSetter: r('legendSetter'),
    legendSub: r('legendSub'),
    legendServe: r('legendServe'),
    footer: t('report.footer', { date: today() }),
  };
}

function matchFileBase(match: MatchWithTeams): string {
  const day = match.played_at ? match.played_at.slice(0, 10) : 'partit';
  return `${day} ${safeFilename(match.home.short_name ?? match.home.name)}-${safeFilename(match.away.short_name ?? match.away.name)}`;
}

function matchHeader(m: UseMatch): GsHeader {
  const match = m.match!;
  const { date, time } = dateParts(match.played_at);
  return {
    home: match.home.name,
    away: match.away.name,
    sets: (m.state?.sets ?? []).map((s) => ({ h: s.home, a: s.away })),
    setsWon: { h: m.state?.setsWon.H ?? 0, a: m.state?.setsWon.A ?? 0 },
    lines: [date, match.competition ?? '', time, [match.phase, match.city ?? match.venue].filter(Boolean).join(' · ')],
  };
}

// Files de les estadístiques generals d'un partit (els dos equips)
export function matchGeneralTeams(m: UseMatch, set: number | null = null): Record<Side, GsTeam> {
  const match = m.match!;
  const st = computeMatchStats(m.events, rulesOf(match), { set, setters: settersOf(m.players) });
  const team = (side: Side): GsTeam => {
    const nums = Object.keys(st.players[side])
      .map(Number)
      .sort((a, b) => a - b);
    const rows: GsRow[] = nums.map((n) => {
      const p = m.players.find((x) => x.side === side && x.shirt_number === n);
      return { label: `${n} ${p ? playerDisplayName(p.players) : ''}`.trim(), skills: st.players[side][n].skills };
    });
    return { name: side === 'H' ? match.home.name : match.away.name, rows, total: st.teams[side].skills };
  };
  return { H: team('H'), A: team('A') };
}

export async function exportMatchGeneralPdf(m: UseMatch, t: TFunction) {
  const match = m.match!;
  const teams = matchGeneralTeams(m);
  // Primer l'equip propi
  const order: Side[] = !match.home.is_own && match.away.is_own ? ['A', 'H'] : ['H', 'A'];
  const doc = new PdfDocument({ title: `${t('report.general')} · ${match.home.name} – ${match.away.name}` });
  drawGeneralStats(doc, matchHeader(m), order.map((s) => teams[s]), generalLabels(t));
  await saveFile(`${matchFileBase(match)} ${safeFilename(t('report.general'))}.pdf`, doc.toBlob());
}

export async function exportMatchReportPdf(m: UseMatch, t: TFunction) {
  const match = m.match!;
  const report = computeMatchReport(m.events, rulesOf(match), { setters: settersOf(m.players) });
  const { date, time } = dateParts(match.played_at);
  const team = (side: Side): MrTeam => {
    const info = side === 'H' ? match.home : match.away;
    return {
      name: info.name,
      coach: info.coach ?? null,
      assistant: info.assistant ?? null,
      players: m.players
        .filter((p) => p.side === side)
        .map((p) => ({ number: p.shirt_number, name: playerDisplayName(p.players), libero: p.is_libero, captain: p.is_captain })),
    };
  };
  const doc = new PdfDocument({ title: `${t('report.matchReport')} · ${match.home.name} – ${match.away.name}` });
  drawMatchReport(
    doc,
    {
      competition: match.competition ?? '',
      phase: match.phase ?? '',
      date,
      time,
      city: match.city ?? '',
      hall: match.venue ?? '',
      spectators: match.spectators != null ? String(match.spectators) : '',
      referees: match.referees ?? '',
      teams: { H: team('H'), A: team('A') },
      report,
    },
    reportLabels(t),
  );
  await saveFile(`${matchFileBase(match)} ${safeFilename(t('report.matchReport'))}.pdf`, doc.toBlob());
}

// Estadístiques generals acumulades d'un equip (diversos partits)
export async function exportSeasonGeneralPdf(
  opts: { teamName: string; subtitle: string; lines: string[]; rows: GsRow[]; total: SkillCounts },
  t: TFunction,
) {
  const doc = new PdfDocument({ title: `${t('report.general')} · ${opts.teamName}` });
  drawGeneralStats(doc, { lines: [opts.teamName, ...opts.lines] }, [{ name: opts.subtitle, rows: opts.rows, total: opts.total }], generalLabels(t));
  await saveFile(`${safeFilename(opts.teamName)} ${safeFilename(opts.subtitle)} ${safeFilename(t('report.general'))}.pdf`, doc.toBlob());
}
