import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { runPgTransaction } from '../db/pg-transaction';
import { pool } from '../db/pool';
import {
  AdminRuleSetsController,
  AdminRuleVersionsController,
  AdminRulesOverviewController,
  EntryDerivationController,
  MyRegistrationOptionsController,
  ProductRulesController,
  RulesController,
} from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  controllers: [
    RulesController,
    ProductRulesController,
    EntryDerivationController,
    MyRegistrationOptionsController,
    AdminRulesOverviewController,
    AdminRuleSetsController,
    AdminRuleVersionsController,
  ],
  providers: [
    {
      provide: IdempotencyService,
      useFactory: () => new IdempotencyService(runPgTransaction, pool),
    },
    RulesService,
  ],
  exports: [RulesService],
})
export class RulesModule {}
