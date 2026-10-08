import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { runPgTransaction } from '../db/pg-transaction';
import { pool } from '../db/pool';
import { AssistedService } from './assisted.service';
import { CommsService } from './comms.service';
import { ExceptionsService } from './exceptions.service';
import {
  AdminOperationsController,
  AssistedRegistrationController,
  CommunicationsController,
  ExceptionsController,
  MyInboxController,
} from './ops.controller';
import { OperationsSnapshotService } from './operations-snapshot.service';

@Module({
  controllers: [
    MyInboxController,
    CommunicationsController,
    AssistedRegistrationController,
    ExceptionsController,
    AdminOperationsController,
  ],
  providers: [
    {
      provide: IdempotencyService,
      useFactory: () => new IdempotencyService(runPgTransaction, pool),
    },
    CommsService,
    AssistedService,
    ExceptionsService,
    {
      // Constructed directly: the service takes a `Queryable`, which is a type, not an injectable
      // token — letting Nest resolve it aborts app creation.
      provide: OperationsSnapshotService,
      useFactory: () => new OperationsSnapshotService(),
    },
  ],
  exports: [ExceptionsService],
})
export class OpsModule {}
