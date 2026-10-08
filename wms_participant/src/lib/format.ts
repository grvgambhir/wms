import { format, parseISO } from 'date-fns';

/** Human-readable event date range for cards and detail headers. */
export function formatEventDateRange(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (sameMonth) {
    return `${format(start, 'd')} – ${format(end, 'd MMM yyyy')}`;
  }

  if (sameYear) {
    return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
  }

  return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
}

/** Map the participant EN/IT toggle onto an Intl locale tag (money + Europe/Rome dates). */
export function intlLocale(locale: string): string {
  return locale === 'it' ? 'it-IT' : 'en-GB';
}

/** Event range rendered in its operating time zone from canonical UTC timestamps. */
export function formatEventDateRangeInTimeZone(
  startDate: string,
  endDate: string,
  timeZone = 'Europe/Rome',
  locale = 'en-GB',
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  });
  return `${formatter.format(parseISO(startDate))} – ${formatter.format(parseISO(endDate))}`;
}

/** Single ISO-8601 UTC timestamp displayed in Europe/Rome (NFR-07), with a short zone name. */
export function formatDateTimeInTimeZone(
  iso: string,
  timeZone = 'Europe/Rome',
  locale = 'en-GB',
): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(parseISO(iso));
}

/** Long-form date range for event detail hero (mockup A04). */
export function formatEventDateLong(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  return `${format(start, 'd MMMM')} – ${format(end, 'd MMMM, yyyy')}`;
}

/** Short location for event detail (city, country). */
export function formatEventLocationShort(city: string, country: string): string {
  return `${city}, ${country}`;
}

/** Registration deadline display. */
export function formatEventDeadline(date: string): string {
  return format(parseISO(date), 'd MMM, yyyy');
}

/** City + state/country line for event location. */
export function formatEventLocation(city: string, country: string, state?: string): string {
  if (state) {
    return `${city}, ${state} · ${country}`;
  }

  return `${city}, ${country}`;
}

/** Currency display for mock registration fees. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

/** Currency display for API amounts stored as integer minor units (for example cents). */
export function formatMoneyMinor(amountMinor: number, currency: string, locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
}

/** Short clock time for GamesHub schedule rows. */
export function formatClockTime(iso: string): string {
  return format(parseISO(iso), 'h:mm a');
}

/** Regional-indicator flag emoji from an ISO country code (GB → 🇬🇧). */
export function flagEmoji(countryCode?: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  const upper = countryCode.toUpperCase();
  const chars = [...upper].map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...chars);
}

const COUNTRY_NAMES: Record<string, string> = {
  GB: 'United Kingdom',
  IT: 'Italy',
  JP: 'Japan',
  US: 'United States',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  IE: 'Ireland',
  DK: 'Denmark',
  NL: 'Netherlands',
  ES: 'Spain',
};

export const PROFILE_NATIONALITIES = ['GB', 'IT', 'JP', 'US', 'AU', 'DE', 'FR'] as const;

/** Display name for a nationality country code used on profile + pass. */
export function countryName(countryCode?: string): string {
  if (!countryCode) return '';
  return COUNTRY_NAMES[countryCode.toUpperCase()] ?? countryCode.toUpperCase();
}

/** Compact date for accreditation validity (14 May 2027). */
export function formatCompactDate(isoDate: string): string {
  return format(parseISO(isoDate), 'd MMM yyyy');
}
