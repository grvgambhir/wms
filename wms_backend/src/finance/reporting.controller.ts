/**
 * Finance reports and exports. `finance` and `oc_admin` only — OPS-04 says access controls,
 * and these rows carry payer names against amounts.
 */
import { Controller, Get, Header, Inject, Post, Query, Req } from '@nestjs/common';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import type { Page } from '../common/pagination/keyset';
import { ReportingService, type FinanceSummary, type SettlementRow } from './reporting.service';

@Controller('finance')
@Roles('finance', 'oc_admin')
export class ReportingController {
  constructor(@Inject(ReportingService) private readonly reporting: ReportingService) {}

  @Get('settlements')
  settlements(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Page<SettlementRow>> {
    return this.reporting.settlements({ from, to, status, cursor, limit });
  }

  @Get('summary')
  summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ): Promise<FinanceSummary> {
    return this.reporting.summary({ from, to, status });
  }

  /**
   * POST, not GET, and deliberately so: this writes an audit row. A GET that changes state
   * is the kind of thing a browser prefetch or a retry will do for you, unasked.
   */
  @Post('exports/settlements')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportSettlements(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('eventId') eventId?: string,
  ): Promise<string> {
    const result = await this.reporting.exportSettlements({
      filter: { from, to, status },
      actorId: identity.personId,
      eventId: eventId ?? null,
      ip: req.ip,
    });
    return result.csv;
  }
}
