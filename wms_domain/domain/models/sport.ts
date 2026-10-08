export type SportAvailability = 'available' | 'almost_full' | 'full' | 'closed';

export interface Sport {
  id: string;
  name: string;
  iconKey?: string;
  eventId: string;
  disciplineIds: string[];
  availability: SportAvailability;
}

export interface Discipline {
  id: string;
  sportId: string;
  name: string;
  participantType: 'individual' | 'doubles' | 'team';
  categoryIds: string[];
}

export type QuotaStatus = 'available' | 'almost_full' | 'full' | 'waitlist';

export interface CompetitionCategory {
  id: string;
  disciplineId: string;
  name: string;
  ageGroup: string;
  division?: string;
  entryType?: 'competitive' | 'recreational';
  partnerRequired?: boolean;
  quotaStatus?: QuotaStatus;
}
