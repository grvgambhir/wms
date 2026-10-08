export type EventStatus = 'draft' | 'registration_open' | 'registration_closed' | 'live' | 'completed';

export type EventListingSection = 'upcoming' | 'previous';

export interface EventSportsProgramme {
  memberSports: string[];
  otherSports: string[];
}

export interface Event {
  id: string;
  name: string;
  shortName?: string;
  city: string;
  /** US state/province code when relevant (e.g. KS). */
  state?: string;
  country: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  registrationDeadline?: string;
  status: EventStatus;
  /** When true, list first on Events screen (POC featured event). */
  featured?: boolean;
  /** Website-style listing group for A03 ordering. */
  listingSection?: EventListingSection;
  listingOrder?: number;
  /** Green status chip on listing cards (e.g. Open Now !). */
  statusBanner?: string;
  sportCount?: number | string;
  venueCount?: number | string;
  eventFamily?: string;
  listingCopy?: string;
  heroTagline?: string;
  heroSubtitle?: string;
  externalUrl?: string;
  ctaLabel?: string;
  cardImageKey?: string;
  heroImageKey?: string;
  logoKey?: string;
  /** When true, athlete can start in-app registration (POC: WMG Kansai 2027). */
  registerable?: boolean;
  sportsProgramme?: EventSportsProgramme;
  organizer?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  websiteNote?: string;
  mailingZipCode?: string;
  outOfStateParticipantsAllowed?: boolean;
  sportIds: string[];
  description?: string;
  /** Marketing stats for A04 detail cards (e.g. "30K+"). */
  participantCount?: string;
  countryCount?: string;
  ageGroupLabel?: string;
}
