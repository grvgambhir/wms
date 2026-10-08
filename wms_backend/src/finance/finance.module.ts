import { Module } from '@nestjs/common';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { runPgTransaction } from '../db/pg-transaction';
import { pool } from '../db/pool';
import { FinanceLiveController } from './finance.controller';
import { FinanceReads } from './finance-reads';
import { InvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { RefundsController } from './refunds.controller';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { RefundsService } from './refunds.service';
import {
  PAYMENT_PROVIDER,
  StubPaymentProvider,
  type PaymentProvider,
} from '../registration/payment-provider';

@Module({
  controllers: [
    FinanceLiveController,
    InvoicingController,
    RefundsController,
    PromotionsController,
    ReportingController,
  ],
  providers: [
    { provide: FinanceReads, useFactory: () => new FinanceReads(pool) },
    {
      provide: IdempotencyService,
      useFactory: () => new IdempotencyService(runPgTransaction, pool),
    },
    {
      provide: InvoicingService,
      inject: [IdempotencyService],
      useFactory: (idempotency: IdempotencyService) => new InvoicingService(pool, idempotency),
    },
    { provide: PAYMENT_PROVIDER, useFactory: () => new StubPaymentProvider() },
    {
      provide: RefundsService,
      inject: [IdempotencyService, PAYMENT_PROVIDER],
      useFactory: (idempotency: IdempotencyService, payments: PaymentProvider) =>
        new RefundsService(pool, idempotency, payments),
    },
    {
      provide: PromotionsService,
      inject: [IdempotencyService],
      useFactory: (idempotency: IdempotencyService) => new PromotionsService(pool, idempotency),
    },
    { provide: ReportingService, useFactory: () => new ReportingService(pool) },
  ],
  exports: [FinanceReads, InvoicingService, RefundsService, PromotionsService, ReportingService],
})
export class FinanceModule {}
