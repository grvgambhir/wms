// i18n core types. English (the existing centralized `copy` object) is the base
// dictionary; other locales provide partial overrides with EN fallback.
// Backs RFP PLT-02 (English + Italian at launch) — see DELIVERY_PLAN_COMO2027 §6.1.
import { copy } from '@/constants/copy';

export type Locale = 'en' | 'it';

/** Keys come from the English source of truth; values widen to `string` so other
 *  locales can override them (the English source is declared `as const`). */
export type CopyKey = keyof typeof copy;
export type CopyDict = Record<CopyKey, string>;

export const LOCALES: readonly Locale[] = ['en', 'it'];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_LABELS: Record<Locale, string> = { en: 'EN', it: 'IT' };
