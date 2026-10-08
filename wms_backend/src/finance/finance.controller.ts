/**
 * Finance read surface. OC-only: these list every order, payment and entry in the event, so a
 * participant token must never reach them — that is the whole difference from the shim, which
 * had no authentication at all and served these to anyone who asked.
 */
import { Controller, Get, Inject } from '@nestjs/common';
import type { JourneyPayment, RegistrationEntry, RegistrationOrder } from '@wms/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { OC_ROLE_CODES } from '../people/profile.schema';
import { FinanceReads, type LiveEnvelope } from './finance-reads';

@Controller('live')
@Roles(...OC_ROLE_CODES)
export class FinanceLiveController {
  constructor(@Inject(FinanceReads) private readonly reads: FinanceReads) {}

  @Get('orders')
  orders(): Promise<LiveEnvelope<RegistrationOrder>> {
    return this.reads.listOrders();
  }

  @Get('payments')
  payments(): Promise<LiveEnvelope<JourneyPayment>> {
    return this.reads.listPayments();
  }

  @Get('entries')
  entries(): Promise<LiveEnvelope<RegistrationEntry>> {
    return this.reads.listEntries();
  }
}
