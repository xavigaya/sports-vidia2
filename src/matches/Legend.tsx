import { useTranslation } from 'react-i18next';
import { EVALUATIONS, SKILLS, SKILL_TYPES, pointWinner } from '../engine/actions';

// Llegenda completa dels codis
export function Legend() {
  const { t } = useTranslation();
  return (
    <div className="legend stack">
      <section>
        <h3>{t('legend.structure')}</h3>
        <p className="legend-structure mono">
          <span>*</span>
          <span>12</span>
          <span>A</span>
          <span>Q</span>
          <span>#</span>
          <span>3</span>
          <span>5</span>
        </p>
        <ol className="small legend-parts">
          <li>{t('legend.partTeam')}</li>
          <li>{t('legend.partPlayer')}</li>
          <li>{t('legend.partSkill')}</li>
          <li>{t('legend.partType')}</li>
          <li>{t('legend.partEval')}</li>
          <li>{t('legend.partStart')}</li>
          <li>{t('legend.partEnd')}</li>
        </ol>
        <p className="small muted">{t('legend.defaults')}</p>
        <p className="small">{t('legend.doubleSigns')}</p>
      </section>

      <section>
        <h3>{t('legend.evalTitle')}</h3>
        <div className="table-scroll">
          <table className="table small legend-table">
            <thead>
              <tr>
                <th />
                {EVALUATIONS.map((e) => (
                  <th key={e} className="center mono legend-eval">
                    {e}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SKILLS.map((s) => (
                <tr key={s}>
                  <th>
                    <span className="mono legend-key">{s}</span> {t(`skills.${s}`)}
                  </th>
                  {EVALUATIONS.map((e) => {
                    const w = pointWinner({ side: 'H', skill: s, evaluation: e });
                    return (
                      <td key={e} className={w === 'H' ? 'win' : w === 'A' ? 'lose' : ''}>
                        {t(`evals.${s}.${EVAL_KEY[e]}`)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">
          <span className="legend-chip win">{t('legend.pointFor')}</span> <span className="legend-chip lose">{t('legend.pointAgainst')}</span>{' '}
          <span className="muted">{t('legend.autoPoint')}</span>
        </p>
      </section>

      <div className="grid-2">
        <section>
          <h3>{t('legend.typesTitle')}</h3>
          <ul className="small legend-list">
            {SKILL_TYPES.map((ty) => (
              <li key={ty}>
                <span className="mono legend-key">{ty}</span> {t(`skillTypes.${ty}`)}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>{t('legend.zonesTitle')}</h3>
          <div className="legend-zones mono">
            <div className="lz-net">{t('legend.net')}</div>
            {[4, 3, 2, 7, 8, 9, 5, 6, 1].map((z) => (
              <span key={z}>{z}</span>
            ))}
          </div>
          <p className="small muted">{t('legend.zonesHelp')}</p>
        </section>
      </div>

      <section>
        <h3>{t('legend.scoreTitle')}</h3>
        <ul className="small legend-list">
          <li>
            <code>*p</code> / <code>ap</code> — {t('live.cmdHelp.point')}
          </li>
          <li>
            <code>*e</code> / <code>ae</code> — {t('live.cmdHelp.error')}
          </li>
          <li>
            <code>*T</code> / <code>aT</code> — {t('live.cmdHelp.timeout')}
          </li>
          <li>
            <code>*c3:13</code> — {t('live.cmdHelp.sub')}
          </li>
          <li>
            <code>*l10:5</code> — {t('live.cmdHelp.libero')}
          </li>
          <li>
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> — {t('live.cmdHelp.undo')}
          </li>
        </ul>
      </section>

      <section>
        <h3>{t('legend.examplesTitle')}</h3>
        <ul className="small legend-list">
          <li>
            <code>S+</code> — {t('legend.ex1')}
          </li>
          <li>
            <code>a7R#</code> — {t('legend.ex2')}
          </li>
          <li>
            <code>a3E+ a11AQ#38</code> — {t('legend.ex3')}
          </li>
          <li>
            <code>*12SH=</code> — {t('legend.ex4')}
          </li>
          <li>
            <code>S- 5R+ 9E# 4A/ a2B#</code> — {t('legend.ex5')}
          </li>
        </ul>
      </section>
    </div>
  );
}

export const EVAL_KEY: Record<string, string> = { '#': 'perfect', '+': 'positive', '!': 'ok', '-': 'negative', '/': 'poor', '=': 'error' };
