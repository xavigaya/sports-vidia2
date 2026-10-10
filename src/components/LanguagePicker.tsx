import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage } from '../i18n';

export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  return (
    <label className="lang-picker">
      <span className="sr-only">{t('nav.language')}</span>
      <select value={i18n.resolvedLanguage} onChange={(e) => setLanguage(e.target.value)} aria-label={t('nav.language')}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
