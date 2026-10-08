import type { Accreditation } from '@/domain/models/accreditation';
import type { AthleteProfile } from '@/domain/models/athlete';
import type { EligibilityDocument, DocumentRequirement } from '@/domain/models/document';
import type { Event } from '@/domain/models/event';
import type { AppNotification, ScheduleItem, Venue } from '@/domain/models/gameshub';
import type { MatchFeedUpdate, MatchResult } from '@/domain/models/match';
import type { AthleteSummary } from '@/domain/models/athlete';
import type { RegistrationFeeConfig } from '@/domain/models/registration';
import type { CompetitionCategory, Discipline, Sport } from '@/domain/models/sport';

import accreditationsJson from './accreditations.json';
import athletesJson from './athletes.json';
import categoriesJson from './categories.json';
import disciplinesJson from './disciplines.json';
import documentRequirementsJson from './document-requirements.json';
import documentsJson from './documents.json';
import wmsEventsJson from './wms-events.json';
import matchSequencesJson from './match-sequences.json';
import matchesJson from './matches.json';
import notificationsJson from './notifications.json';
import partnerCandidatesJson from './partner-candidates.json';
import registrationFeesJson from './registration-fees.json';
import schedulesJson from './schedules.json';
import { DEMO_SPORT_RULES } from './demoSportRules';
import sportsJson from './sports.json';
import venuesJson from './venues.json';

/** Typed in-memory fixture bundle — only mock repositories may import this. */
export const fixtures = {
  athletes: athletesJson as AthleteProfile[],
  events: wmsEventsJson as Event[],
  sports: sportsJson as Sport[],
  sportRules: DEMO_SPORT_RULES.items,
  disciplines: disciplinesJson as Discipline[],
  categories: categoriesJson as CompetitionCategory[],
  partnerCandidates: partnerCandidatesJson as AthleteSummary[],
  registrationFees: registrationFeesJson as RegistrationFeeConfig[],
  documentRequirements: documentRequirementsJson as DocumentRequirement[],
  documents: documentsJson as EligibilityDocument[],
  venues: venuesJson as Venue[],
  schedules: schedulesJson as ScheduleItem[],
  notifications: notificationsJson as AppNotification[],
  matches: matchesJson as MatchResult[],
  matchSequences: matchSequencesJson as Record<string, MatchFeedUpdate[]>,
  accreditations: accreditationsJson as Accreditation[],
} as const;
