import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import { ConsentService, type ConsentListView, type ConsentRecordView } from './consent.service';
import { PeopleService, type MeProfile } from './people.service';
import type { Page } from '../common/pagination/keyset';
import {
  SelfServiceService,
  type MyEntry,
  type MyInvoice,
  type MyPayment,
} from './self-service.service';
import {
  PreRegistrationService,
  type ClaimPreRegistrationView,
  type PreRegistrationLookupView,
} from './pre-registration.service';

@Controller('me')
export class MeController {
  constructor(
    @Inject(PeopleService) private readonly people: PeopleService,
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(PreRegistrationService) private readonly preRegistrations: PreRegistrationService,
    @Inject(SelfServiceService) private readonly selfService: SelfServiceService,
  ) {}

  /**
   * PLT-07's "entries". The person comes from the token and there is no athlete id anywhere in
   * the signature — that absence is the point: it is the parameter the whole identity design
   * exists to remove, and its lack here is what forces callers to stop guessing entry ids.
   */
  @Get('entries')
  entries(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('eventId') eventId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Page<MyEntry>> {
    return this.selfService.entries({ personId: identity.personId, eventId, cursor, limit });
  }

  @Get('invoices')
  invoices(@CurrentIdentity() identity: AuthenticatedIdentity): Promise<MyInvoice[]> {
    return this.selfService.invoices(identity.personId);
  }

  @Get('invoices/:invoiceId')
  invoice(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('invoiceId') invoiceId: string,
  ): Promise<MyInvoice> {
    return this.selfService.invoice(identity.personId, invoiceId);
  }

  @Get('payments')
  payments(@CurrentIdentity() identity: AuthenticatedIdentity): Promise<MyPayment[]> {
    return this.selfService.payments(identity.personId);
  }

  @Get()
  getMe(@CurrentIdentity() identity: AuthenticatedIdentity): Promise<MeProfile> {
    return this.people.getMe(identity.personId);
  }

  @Patch('profile')
  patchProfile(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<MeProfile> {
    return this.people.patchProfile({
      personId: identity.personId,
      accessToken: req.accessToken ?? '',
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }

  @Post('mfa/complete')
  @HttpCode(HttpStatus.OK)
  completeMfa(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
  ): Promise<MeProfile> {
    return this.people.completeMfa({
      personId: identity.personId,
      accessToken: req.accessToken ?? '',
      roles: identity.roles,
    });
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  disableMfa(@CurrentIdentity() identity: AuthenticatedIdentity): Promise<MeProfile> {
    return this.people.disableMfa({ personId: identity.personId, roles: identity.roles });
  }

  @Get('consents')
  getConsents(@CurrentIdentity() identity: AuthenticatedIdentity): Promise<ConsentListView> {
    return this.consents.list(identity.personId);
  }

  @Post('consents')
  @HttpCode(HttpStatus.OK)
  writeConsent(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ConsentRecordView> {
    return this.consents.write({
      personId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }

  @Get('pre-registrations')
  lookupPreRegistration(
    @CurrentIdentity() _identity: AuthenticatedIdentity,
    @Query('query') query?: string,
  ): Promise<PreRegistrationLookupView> {
    return this.preRegistrations.lookup(query);
  }

  @Post('pre-registrations/:recordId/claim')
  @HttpCode(HttpStatus.OK)
  claimPreRegistration(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('recordId') recordId: string,
    @Req() req: AuthenticatedRequest,
    @Body() _body: unknown,
  ): Promise<ClaimPreRegistrationView> {
    return this.preRegistrations.claim({
      personId: identity.personId,
      recordId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }
}
