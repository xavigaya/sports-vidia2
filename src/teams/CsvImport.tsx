import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBox } from '../components/ui';
import { downloadText, toCsv } from '../lib/csv';
import type { Season, Team } from '../lib/types';
import { parseTeamCsv, EXPORT_HEADERS, type CsvParseResult } from './teamCsv';
import { importPlayers, type ImportSummary } from './importTeams';

interface Props {
  clubId: string;
  targetTeam: Team | null;
  seasons?: Season[];
  onDone: () => void;
}

export function CsvImport({ clubId, targetTeam, seasons = [], onDone }: Props) {
  const { t } = useTranslation();
  const [parsed, setParsed] = useState<CsvParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [newTeamsOwn, setNewTeamsOwn] = useState(false);
  const [seasonId, setSeasonId] = useState(seasons[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teamNames = useMemo(() => {
    if (!parsed || targetTeam) return [];
    return [...new Set(parsed.rows.map((r) => r.team).filter(Boolean) as string[])];
  }, [parsed, targetTeam]);

  async function onFile(f: File) {
    setResult(null);
    setError(null);
    setFileName(f.name);
    const r = parseTeamCsv(await f.text());
    if (!targetTeam && !r.hasTeamColumn && r.rows.length > 0) {
      setError(t('csv.needTeamColumn'));
    }
    setParsed(r);
  }

  async function onImport() {
    if (!parsed) return;
    setBusy(true);
    const summary = await importPlayers(parsed.rows, { clubId, targetTeam, newTeamsOwn, seasonId: seasonId || null });
    setBusy(false);
    setResult(summary);
  }

  function downloadTemplate() {
    const header = targetTeam ? EXPORT_HEADERS.filter((h) => !['equip', 'codi_equip', 'categoria', 'propi'].includes(h)) : EXPORT_HEADERS;
    const example = targetTeam
      ? ['1', 'Nom1', 'Cognom1', '', 'S', 'no', 'no', 'no']
      : ['Equip rival', 'RIV', 'Sènior', 'no', '1', 'Nom1', 'Cognom1', '', 'S', 'no', 'no', 'no'];
    downloadText(targetTeam ? 'plantilla_jugadors.csv' : 'plantilla_equips.csv', toCsv([header, example]));
  }

  if (result) {
    return (
      <div className="stack">
        <div className="notice">
          {t('csv.result', { teams: result.teamsCreated, created: result.playersCreated, updated: result.playersUpdated })}
        </div>
        {result.errors.length > 0 && (
          <div className="error-box">
            <strong>{t('csv.rowErrors')}</strong>
            <ul className="small">
              {result.errors.slice(0, 20).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="row end">
          <button className="btn btn-primary" onClick={onDone}>
            {t('common.close')}
          </button>
        </div>
      </div>
    );
  }

  const canImport = !!parsed && parsed.rows.length > 0 && (targetTeam !== null || parsed.hasTeamColumn);

  return (
    <div className="stack">
      <p className="muted small">{targetTeam ? t('csv.helpTeam', { team: targetTeam.name }) : t('csv.helpAll')}</p>
      <p className="small">
        <code>{(targetTeam ? EXPORT_HEADERS.slice(4) : EXPORT_HEADERS).join(';')}</code>
      </p>
      <div className="row wrap">
        <label className="btn btn-primary">
          {t('csv.chooseFile')}
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />
        </label>
        <button className="btn" type="button" onClick={downloadTemplate}>
          {t('csv.template')}
        </button>
        {fileName && <span className="muted small">{fileName}</span>}
      </div>

      {error && <ErrorBox message={error} />}

      {parsed && (
        <div className="stack">
          <div className="notice">
            {t('csv.preview', { rows: parsed.rows.length })}
            {teamNames.length > 0 && <> · {t('csv.teamsInFile', { teams: teamNames.join(', ') })}</>}
          </div>
          {parsed.errors.length > 0 && (
            <div className="error-box small">
              {parsed.errors.slice(0, 10).map((e, i) => (
                <div key={i}>{t(`csv.err.${e.message}`, { line: e.line })}</div>
              ))}
            </div>
          )}
          {parsed.rows.length > 0 && (
            <div className="table-scroll">
              <table className="table small">
                <tbody>
                  {parsed.rows.slice(0, 8).map((r, i) => (
                    <tr key={i}>
                      {!targetTeam && <td>{r.team}</td>}
                      <td className="mono">{r.number}</td>
                      <td>
                        {r.firstName} {r.lastName}
                      </td>
                      <td>{t(`positions.${r.position}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 8 && <div className="muted small">… +{parsed.rows.length - 8}</div>}
            </div>
          )}
          {!targetTeam && parsed.hasTeamColumn && (
            <div className="row wrap">
              <label className="check">
                <input type="checkbox" checked={newTeamsOwn} onChange={(e) => setNewTeamsOwn(e.target.checked)} />
                {t('csv.newTeamsOwn')}
              </label>
              {seasons.length > 0 && (
                <label className="row">
                  <span className="small muted">{t('teams.season')}</span>
                  <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
                    <option value="">{t('teams.noSeason')}</option>
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          <p className="small muted">{t('csv.updateRule')}</p>
          <div className="row end">
            <button className="btn btn-primary" disabled={!canImport || busy} onClick={() => void onImport()}>
              {busy ? t('common.saving') : t('csv.import', { rows: parsed.rows.length })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
