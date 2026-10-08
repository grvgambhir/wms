import { Controller, Get, Header, Inject, Param, Query, Req } from '@nestjs/common';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import type { Page } from '../common/pagination/keyset';
import { OC_ROLE_CODES } from '../people/profile.schema';
import {
  AdminRegistrationsService,
  type RegistrationCounts,
  type RegistrationDetail,
  type RegistrationListItem,
} from './admin-registrations.service';

@Controller('admin/registrations')
@Roles(...OC_ROLE_CODES)
export class AdminRegistrationsController {
  constructor(
    @Inject(AdminRegistrationsService) private readonly registrations: AdminRegistrationsService,
  ) {}

  @Get()
  list(
    @Query('eventId') eventId?: string,
    @Query('sportId') sportId?: string,
    @Query('productId') productId?: string,
    @Query('category') category?: string,
    @Query('status') status?: string | string[],
    @Query('grade') grade?: string,
    @Query('paymentState') paymentState?: string,
    @Query('evidenceState') evidenceState?: string,
    @Query('teamId') teamId?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Page<RegistrationListItem>> {
    return this.registrations.list({
      eventId,
      sportId,
      productId,
      category,
      status,
      grade,
      paymentState,
      evidenceState,
      teamId,
      search,
      cursor,
      limit,
    });
  }

  @Get('counts')
  counts(
    @Query('eventId') eventId?: string,
    @Query('sportId') sportId?: string,
    @Query('productId') productId?: string,
    @Query('category') category?: string,
    @Query('grade') grade?: string,
    @Query('paymentState') paymentState?: string,
    @Query('evidenceState') evidenceState?: string,
    @Query('teamId') teamId?: string,
    @Query('search') search?: string,
  ): Promise<RegistrationCounts> {
    return this.registrations.counts({
      eventId,
      sportId,
      productId,
      category,
      grade,
      paymentState,
      evidenceState,
      teamId,
      search,
    });
  }

  @Get('filter-options')
  filterOptions(@Query('eventId') eventId?: string) {
    return this.registrations.filterOptions(eventId);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="registrations.csv"')
  @Header('X-Export-Row-Limit', '20000')
  async exportCsv(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Query('eventId') eventId?: string,
    @Query('sportId') sportId?: string,
    @Query('productId') productId?: string,
    @Query('category') category?: string,
    @Query('status') status?: string | string[],
    @Query('grade') grade?: string,
    @Query('paymentState') paymentState?: string,
    @Query('evidenceState') evidenceState?: string,
    @Query('teamId') teamId?: string,
    @Query('search') search?: string,
  ): Promise<string> {
    const result = await this.registrations.exportCsv({
      filter: {
        eventId,
        sportId,
        productId,
        category,
        status,
        grade,
        paymentState,
        evidenceState,
        teamId,
        search,
      },
      actorId: identity.personId,
      actorRole:
        identity.roles.find((role) => (OC_ROLE_CODES as readonly string[]).includes(role)) ??
        'oc_staff',
      ip: req.ip,
    });
    return result.csv;
  }

  @Get(':entryId')
  detail(
    @Param('entryId') entryId: string,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ): Promise<RegistrationDetail> {
    return this.registrations.detail(entryId, identity);
  }
}
