import { ApiAccreditationRepository } from '@/data/api/apiAccreditationRepository';
import { ApiConsentRepository } from '@/data/api/apiConsentRepository';
import { ApiEvidenceRepository } from '@/data/api/apiEvidenceRepository';
import { ApiPartnerRepository } from '@/data/api/apiPartnerRepository';
import { ApiPreRegistrationRepository } from '@/data/api/apiPreRegistrationRepository';
import { ApiRestrictedEvidenceRepository } from '@/data/api/apiRestrictedEvidenceRepository';
import { ApiTeamRosterRepository } from '@/data/api/apiTeamRosterRepository';
import { ApiParticipantInboxRepository } from '@/data/api/apiParticipantInboxRepository';
import { ApiRegistrationJourneyRepository } from '@/data/api/apiRegistrationJourneyRepository';
import { ApiMyEntriesRepository } from '@/data/api/apiMyEntriesRepository';
import { ApiRulesRepository } from '@/data/api/apiRulesRepository';
import { MockAccreditationRepository } from '@/data/mock/repositories/mockAccreditationRepository';
import { MockAthleteRepository } from '@/data/mock/repositories/mockAthleteRepository';
import { MockAuthRepository } from '@/data/mock/repositories/mockAuthRepository';
import { MockConsentRepository } from '@/data/mock/repositories/mockConsentRepository';
import { MockDocumentsRepository } from '@/data/mock/repositories/mockDocumentsRepository';
import { MockEventsRepository } from '@/data/mock/repositories/mockEventsRepository';
import { MockEvidenceRepository } from '@/data/mock/repositories/mockEvidenceRepository';
import { MockFinanceRepository } from '@/data/mock/repositories/mockFinanceRepository';
import { MockGamesHubRepository } from '@/data/mock/repositories/mockGamesHubRepository';
import { MockPartnerRepository } from '@/data/mock/repositories/mockPartnerRepository';
import { MockPaymentRepository } from '@/data/mock/repositories/mockPaymentRepository';
import { MockPreRegistrationRepository } from '@/data/mock/repositories/mockPreRegistrationRepository';
import { MockRegistrationRepository } from '@/data/mock/repositories/mockRegistrationRepository';
import { MockResultsRepository } from '@/data/mock/repositories/mockResultsRepository';
import { MockRestrictedEvidenceRepository } from '@/data/mock/repositories/mockRestrictedEvidenceRepository';
import { MockTeamRosterRepository } from '@/data/mock/repositories/mockTeamRosterRepository';

// Journey and rules talk to wms_backend. Mock* classes stay in src/data/mock as the
// reference/fallback. Finance still merges live orders from the SAME journey instance.
const registrationJourney = new ApiRegistrationJourneyRepository();
const myEntries = new ApiMyEntriesRepository();

/** Singleton repository wiring. Journey/rules = Api*; remaining screens stay on mocks. */
export const repositories = {
  auth: new MockAuthRepository(),
  events: new MockEventsRepository(),
  athlete: new MockAthleteRepository(),
  registration: new MockRegistrationRepository(),
  registrationJourney,
  myEntries,
  finance: new MockFinanceRepository(registrationJourney),
  rules: new ApiRulesRepository(),
  evidence: new ApiEvidenceRepository(new MockEvidenceRepository()),
  restrictedEvidence: new ApiRestrictedEvidenceRepository(new MockRestrictedEvidenceRepository()),
  teamRosters: new ApiTeamRosterRepository(new MockTeamRosterRepository()),
  documents: new MockDocumentsRepository(),
  partners: new ApiPartnerRepository(new MockPartnerRepository()),
  payment: new MockPaymentRepository(),
  accreditation: new ApiAccreditationRepository(new MockAccreditationRepository()),
  participantInbox: new ApiParticipantInboxRepository(),
  preRegistration: new ApiPreRegistrationRepository(new MockPreRegistrationRepository()),
  consents: new ApiConsentRepository(new MockConsentRepository()),
  gamesHub: new MockGamesHubRepository(),
  results: new MockResultsRepository(),
} as const;

export type Repositories = typeof repositories;
