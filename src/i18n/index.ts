import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ml from './ml.json';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ml: { translation: ml } },
  lng: localStorage.getItem('pp-lang') || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: string) {
  localStorage.setItem('pp-lang', lang);
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}

export default i18n;
