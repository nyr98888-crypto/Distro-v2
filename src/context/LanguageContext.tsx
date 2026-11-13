import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  translations,
  type LocaleCode,
  type TranslationKey,
} from '../i18n/translations'

interface LanguageContextValue {
  locale: LocaleCode
  dir: 'ltr' | 'rtl'
  setLocale: (locale: LocaleCode) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const STORAGE_KEY = 'distro-v2-locale'
export const defaultLanguage: LocaleCode = 'he'

function readStoredLocale(): LocaleCode {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'en') return 'en'
  if (saved === 'he') return 'he'
  return defaultLanguage
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => readStoredLocale())

  const dir: 'ltr' | 'rtl' = locale === 'he' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
    localStorage.setItem(STORAGE_KEY, locale)
  }, [locale, dir])

  const setLocale = useCallback((next: LocaleCode) => {
    setLocaleState(next)
  }, [])

  const t = useCallback(
    (key: TranslationKey) =>
      translations[locale][key] ?? translations.he[key] ?? translations.en[key] ?? key,
    [locale],
  )

  const value = useMemo(
    () => ({ locale, dir, setLocale, t }),
    [locale, dir, setLocale, t],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
