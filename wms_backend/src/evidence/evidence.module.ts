import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { runPgTransaction } from '../db/pg-transaction';
import { pool } from '../db/pool';
import {
  EvidenceController,
  EvidenceOnEntryController,
  RestrictedEvidenceController,
} from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { EVIDENCE_STORAGE, LocalStubEvidenceStorage } from './evidence-storage';
import { RestrictedEvidenceService } from './restricted-evidence.service';
import { createRestrictedPool, RESTRICTED_POOL } from './restricted-pool';

@Module({
  controllers: [EvidenceOnEntryController, EvidenceController, RestrictedEvidenceController],
  providers: [
    {
      provide: IdempotencyService,
      useFactory: () => new IdempotencyService(runPgTransaction, pool),
    },
    { provide: EVIDENCE_STORAGE, useClass: LocalStubEvidenceStorage },
    {
      provide: RESTRICTED_POOL,
      useFactory: () => createRestrictedPool(),
    },
    EvidenceService,
    RestrictedEvidenceService,
  ],
  exports: [EvidenceService, RestrictedEvidenceService, EVIDENCE_STORAGE],
})
export class EvidenceModule {}
