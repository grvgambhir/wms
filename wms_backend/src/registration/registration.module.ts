import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { runPgTransaction } from '../db/pg-transaction';
import { pool } from '../db/pool';
import { PAYMENT_PROVIDER, StubPaymentProvider, type PaymentProvider } from './payment-provider';
import { PostgresRegistrationJourneyRepository } from './postgres-registration-journey.repository';
import { RulesModule } from '../rules/rules.module';
import { OpsModule } from '../ops/ops.module';
import { AdminRegistrationsController } from './admin-registrations.controller';
import { AdminRegistrationsService } from './admin-registrations.service';
import {
  MyEntriesController,
  RegistrationEntriesController,
  RegistrationJourneysController,
  RegistrationOrdersController,
  WaitlistsController,
} from './registration.controller';

@Module({
  imports: [RulesModule, OpsModule],
  controllers: [
    MyEntriesController,
    RegistrationJourneysController,
    RegistrationEntriesController,
    WaitlistsController,
    RegistrationOrdersController,
    AdminRegistrationsController,
  ],
  providers: [
    {
      provide: IdempotencyService,
      useFactory: () => new IdempotencyService(runPgTransaction, pool),
    },
    { provide: PAYMENT_PROVIDER, useFactory: () => new StubPaymentProvider() },
    AdminRegistrationsService,
    {
      provide: PostgresRegistrationJourneyRepository,
      inject: [IdempotencyService, PAYMENT_PROVIDER],
      useFactory: (idempotency: IdempotencyService, paymentProvider: PaymentProvider) =>
        new PostgresRegistrationJourneyRepository(pool, idempotency, paymentProvider),
    },
  ],
  exports: [PostgresRegistrationJourneyRepository, PAYMENT_PROVIDER],
})
export class RegistrationModule {}
