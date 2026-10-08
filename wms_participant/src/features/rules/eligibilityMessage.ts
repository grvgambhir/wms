import type { CopyDict, CopyKey } from '@/i18n';

/** Map an eligibility refusal key (never a sentence) onto the current locale. */
export function eligibilityMessage(copy: CopyDict, messageKey: string): string {
  if (messageKey in copy) return copy[messageKey as CopyKey];
  return copy['eligibility.cannot_evaluate'];
}
