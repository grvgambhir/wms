import { ApiAssistedRegistrationRepository } from "./ApiAssistedRegistrationRepository";
import { ApiCommunicationsRepository } from "./ApiCommunicationsRepository";
import { ApiExceptionsRepository } from "./ApiExceptionsRepository";
import { ApiAccreditationDeskRepository } from "./ApiAccreditationDeskRepository";
import { MockAccreditationDeskRepository } from "./MockAccreditationDeskRepository";
import { MockAssistedRegistrationRepository } from "./MockAssistedRegistrationRepository";
import { MockCommunicationsRepository } from "./MockCommunicationsRepository";
import { ApiFinanceJourneySource } from "./ApiFinanceJourneySource";
import { ApiAdminPeopleRepository } from "./ApiAdminPeopleRepository";
import { ApiAdminRegistrationsRepository } from "./ApiAdminRegistrationsRepository";
import { MockAdminPeopleRepository } from "./MockAdminPeopleRepository";
import { MockAdminRegistrationsRepository } from "./MockAdminRegistrationsRepository";
import { MockFinanceRepository } from "./MockFinanceRepository";
import { MockExceptionsRepository } from "./MockExceptionsRepository";
import { ApiEvidenceReviewRepository } from "./ApiEvidenceReviewRepository";
import { ApiRosterChangeRepository } from "./ApiRosterChangeRepository";
import { ApiWaitlistRepository } from "./ApiWaitlistRepository";
import { ApiOperationsRepository } from "./ApiOperationsRepository";
import { MockOperationsRepository } from "./MockOperationsRepository";
import { ApiRulesRepository } from "./ApiRulesRepository";
import { MockRulesRepository } from "./MockRulesRepository";
import { emptyFinanceJourneySource } from "./FinanceJourneySource";
import type { AccreditationDeskRepository } from "./AccreditationDeskRepository";
import type { AssistedRegistrationRepository } from "./AssistedRegistrationRepository";
import type { CommunicationsRepository } from "./CommunicationsRepository";
import type { AdminPeopleRepository } from "./AdminPeopleRepository";
import type { AdminRegistrationsRepository } from "./AdminRegistrationsRepository";
import type { ExceptionsRepository } from "./ExceptionsRepository";
import type { FinanceRepository } from "./FinanceRepository";
import type { EvidenceReviewRepository } from "./EvidenceReviewRepository";
import type { RosterChangeRepository } from "./RosterChangeRepository";
import type { WaitlistRepository } from "./WaitlistRepository";
import type { OperationsRepository } from "./OperationsRepository";
import type { RulesRepository } from "./RulesRepository";

const useLiveApi = import.meta.env.MODE !== "test";

// Live browser providers talk to wms_backend; tests stay on in-memory seeds.
export const accreditationDeskRepository: AccreditationDeskRepository =
  useLiveApi
    ? new ApiAccreditationDeskRepository(
        new MockAccreditationDeskRepository(false),
      )
    : new MockAccreditationDeskRepository();
export const assistedRegistrationRepository: AssistedRegistrationRepository =
  useLiveApi
    ? new ApiAssistedRegistrationRepository(
        new MockAssistedRegistrationRepository(false),
      )
    : new MockAssistedRegistrationRepository();
export const communicationsRepository: CommunicationsRepository = useLiveApi
  ? new ApiCommunicationsRepository(new MockCommunicationsRepository(false))
  : new MockCommunicationsRepository();
export const financeRepository: FinanceRepository = new MockFinanceRepository(
  useLiveApi ? new ApiFinanceJourneySource() : emptyFinanceJourneySource,
);
export const exceptionsRepository: ExceptionsRepository = useLiveApi
  ? new ApiExceptionsRepository(new MockExceptionsRepository(false))
  : new MockExceptionsRepository();
export const evidenceReviewRepository: EvidenceReviewRepository =
  new ApiEvidenceReviewRepository();
export const rosterChangeRepository: RosterChangeRepository =
  new ApiRosterChangeRepository();
export const waitlistRepository: WaitlistRepository = new ApiWaitlistRepository();
export const operationsRepository: OperationsRepository = useLiveApi
  ? new ApiOperationsRepository(new MockOperationsRepository())
  : new MockOperationsRepository();
export const rulesRepository: RulesRepository = useLiveApi
  ? new ApiRulesRepository()
  : new MockRulesRepository();
export const adminPeopleRepository: AdminPeopleRepository = useLiveApi
  ? new ApiAdminPeopleRepository()
  : new MockAdminPeopleRepository();
export const adminRegistrationsRepository: AdminRegistrationsRepository =
  useLiveApi
    ? new ApiAdminRegistrationsRepository()
    : new MockAdminRegistrationsRepository();
