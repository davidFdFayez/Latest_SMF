import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageContext = createContext(null);

function applyDocumentLang(lang) {
  const html = document.documentElement;
  // Keep Arabic language, force Latin numbering system site-wide.
  html.setAttribute('lang', lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB');
  html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  document.body.classList.remove('lang-ar', 'lang-en');
  document.body.classList.add(lang === 'ar' ? 'lang-ar' : 'lang-en');
}

export function LanguageProvider({ children }) {
  const { i18n } = useTranslation();
  const [lang, setLangState] = useState(() => {
    if (typeof localStorage === 'undefined') return 'ar';
    return localStorage.getItem('smf_lang') || 'ar';
  });

  useEffect(() => {
    applyDocumentLang(lang);
  }, [lang]);

  const setLang = useCallback((next) => {
    const value = next === 'en' ? 'en' : 'ar';
    localStorage.setItem('smf_lang', value);
    i18n.changeLanguage(value);
    setLangState(value);
  }, [i18n]);

  const toggleLang = useCallback(() => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  }, [lang, setLang]);

  const value = useMemo(() => ({
    lang,
    isRTL: lang === 'ar',
    setLang,
    toggleLang,
  }), [lang, setLang, toggleLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within a LanguageProvider');
  return ctx;
}
