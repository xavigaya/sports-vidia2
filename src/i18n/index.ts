import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ca from './locales/ca.json';
import es from './locales/es.json';
import en from './locales/en.json';

// El català és l'idioma de referència. Les altres traduccions es generen
// a partir del fitxer ca.json i es poden revisar i editar a mà.
export const LANGUAGES = [
  { code: 'ca', label: 'Català' },
  { code: 'es', label: 'Castellano' },
  { code: 'en', label: 'English' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'svidia.lang';

function storedLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLanguage(code: string) {
  void i18n.changeLanguage(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* emmagatzematge no disponible */
  }
  document.documentElement.lang = code;
}

void i18n.use(initReactI18next).init({
  resources: {
    ca: { translation: ca },
    es: { translation: es },
    en: { translation: en },
  },
  lng: storedLanguage() ?? 'ca',
  fallbackLng: 'ca',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = i18n.language;

export default i18n;
