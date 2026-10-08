import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { runPgTransaction } from '../db/pg-transaction';
import { pool } from '../db/pool';
import { CategoryCombinationService } from './category-combination.service';
import {
  CategoryCombinationsAdminController,
  StartListsAdminController,
  StartListsPublicController,
} from './competition.controller';
import { StartListService } from './start-list.service';

@Module({
  controllers: [
    StartListsPublicController,
    StartListsAdminController,
    CategoryCombinationsAdminController,
  ],
  providers: [
    {
      provide: IdempotencyService,
      useFactory: () => new IdempotencyService(runPgTransaction, pool),
    },
    {
      provide: StartListService,
      inject: [IdempotencyService],
      useFactory: (idempotency: IdempotencyService) => new StartListService(pool, idempotency),
    },
    {
      provide: CategoryCombinationService,
      inject: [IdempotencyService],
      useFactory: (idempotency: IdempotencyService) =>
        new CategoryCombinationService(pool, idempotency),
    },
  ],
  exports: [StartListService, CategoryCombinationService],
})
export class CompetitionModule {}
