import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { runPgTransaction } from '../db/pg-transaction';
import { pool } from '../db/pool';
import { PartnerService } from './partner.service';
import {
  PartnerRequestsController,
  MyEntryTeamsController,
  MyInvitationsController,
  RosterOnEntryController,
  RosterSubstitutionsController,
  RosterVersionsController,
  TeamInvitationsController,
  TeamsController,
} from './roster.controller';
import { RosterService } from './roster.service';

@Module({
  controllers: [
    RosterOnEntryController,
    MyEntryTeamsController,
    TeamsController,
    TeamInvitationsController,
    RosterVersionsController,
    RosterSubstitutionsController,
    PartnerRequestsController,
    MyInvitationsController,
  ],
  providers: [
    {
      provide: IdempotencyService,
      useFactory: () => new IdempotencyService(runPgTransaction, pool),
    },
    RosterService,
    PartnerService,
  ],
  exports: [RosterService, PartnerService],
})
export class RosterModule {}
