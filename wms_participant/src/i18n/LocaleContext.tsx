// Locale provider + hooks for the EN/IT experience (RFP PLT-02).
// - LocaleProvider holds the current locale and persists it to AsyncStorage.
// - useLocale() reads/sets the locale (used by the LanguageToggle).
// - useCopy() returns a locale-aware copy dictionary; migrated call-sites do
//   `const copy = useCopy(); copy.someKey` (Italian overrides English, EN fallback).
// This is a swappable seam: the dictionaries are plain data, so a future backend /
// translation-management service can supply them without changing call-sites.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getJson, setJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

import { en } from './en';
import { it } from './it';
import { DEFAULT_LOCALE, LOCALES, type CopyDict, type Locale } from './types';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Hydrate the persisted locale once on mount (best-effort; defaults to EN).
  useEffect(() => {
    let active = true;
    getJson<Locale>(storageKeys.locale)
      .then((saved) => {
        if (active && saved && LOCALES.includes(saved)) setLocaleState(saved);
      })
      .catch(() => {
        /* ignore storage errors — fall back to default locale */
      });
    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setJson(storageKeys.locale, next).catch(() => {
      /* non-fatal: locale still applied in-memory for this session */
    });
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}

/** Locale-aware copy. Italian overrides English; any missing IT key falls back to EN. */
export function useCopy(): CopyDict {
  const { locale } = useLocale();
  return useMemo<CopyDict>(
    () => (locale === 'it' ? ({ ...en, ...it } as CopyDict) : en),
    [locale],
  );
}
