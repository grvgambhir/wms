import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { runPgTransaction } from '../db/pg-transaction';
import { pool } from '../db/pool';
import {
  AccreditationActionsController,
  AccreditationDeskController,
  MyAccreditationController,
} from './accreditation.controller';
import { AccreditationService } from './accreditation.service';

@Module({
  controllers: [MyAccreditationController, AccreditationDeskController, AccreditationActionsController],
  providers: [
    {
      provide: IdempotencyService,
      useFactory: () => new IdempotencyService(runPgTransaction, pool),
    },
    AccreditationService,
  ],
  exports: [AccreditationService],
})
export class AccreditationModule {}
