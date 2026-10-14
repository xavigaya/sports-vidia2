// Taula d'estadístiques generals (format Click&Scout) a la pantalla
import { useTranslation } from 'react-i18next';
import type { SkillCounts } from '../stats/compute';
import { GS_EVALS, GS_FORMULAS, GS_SKILLS, gsEfficiency, gsPct, gsPerfect } from './reportData';

export interface GeneralRow {
  key: string;
  label: string;
  skills: SkillCounts;
}

export function GeneralStatsTable({ rows, total }: { rows: GeneralRow[]; total: SkillCounts }) {
  const { t } = useTranslation();
  const cells = (sk: SkillCounts, bold = false) =>
    GS_SKILLS.flatMap((s) => {
      const c = sk[s];
      const has = c.total > 0;
      return [
        <td key={`${s}t`} className="num-cell group-start">
          {has ? c.total : ''}
        </td>,
        ...GS_EVALS.map((e) => (
          <td key={`${s}${e}`} className="num-cell">
            {has && c[e] ? c[e] : ''}
          </td>
        )),
        <td key={`${s}p`} className={`num-cell${bold ? ' strong' : ''}`}>
          {gsPct(gsPerfect(c))}
        </td>,
        <td key={`${s}e`} className={`num-cell${bold ? ' strong' : ''}`}>
          {gsPct(gsEfficiency(s, c))}
        </td>,
      ];
    });

  return (
    <div className="table-scroll">
      <table className="table stats-table general-stats">
        <thead>
          <tr className="group-row">
            <th />
            {GS_SKILLS.map((s) => (
              <th key={s} colSpan={9} className="group-start">
                {t(`skills.${s}`)}
              </th>
            ))}
          </tr>
          <tr>
            <th />
            {GS_SKILLS.flatMap((s) => [
              <th key={`${s}t`} className="num-cell group-start">
                {t('report.tot')}
              </th>,
              ...GS_EVALS.map((e) => (
                <th key={`${s}${e}`} className="num-cell mono">
                  {e}
                </th>
              )),
              <th key={`${s}p`} className="num-cell">
                #%
              </th>,
              <th key={`${s}e`} className="num-cell" title={`*E% = ${GS_FORMULAS[s]}`}>
                *E%
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          <tr className="total-row">
            <td className="name-cell">{t('report.team')}</td>
            {cells(total, true)}
          </tr>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="name-cell">{r.label}</td>
              {cells(r.skills)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            {GS_SKILLS.map((s) => (
              <td key={s} colSpan={9} className="small muted group-start formula">
                *E% = {GS_FORMULAS[s]}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
