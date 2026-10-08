import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req } from '@nestjs/common';
import type { AccreditationOverview, AccreditationRecord, CredentialActionResponse } from '@wms/domain';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import { OC_ROLE_CODES } from '../people/profile.schema';
import { AccreditationService } from './accreditation.service';

@Controller('me')
export class MyAccreditationController {
  constructor(@Inject(AccreditationService) private readonly accreditation: AccreditationService) {}

  @Get('accreditation')
  @Roles('participant')
  getPass(@CurrentIdentity() identity: AuthenticatedIdentity): Promise<AccreditationRecord | null> {
    return this.accreditation.getOwnPass(identity.personId);
  }
}

@Controller('accreditation-desk')
export class AccreditationDeskController {
  constructor(@Inject(AccreditationService) private readonly accreditation: AccreditationService) {}

  @Get()
  @Roles(...OC_ROLE_CODES)
  overview(): Promise<AccreditationOverview> {
    return this.accreditation.getDeskOverview();
  }
}

@Controller('accreditations')
export class AccreditationActionsController {
  constructor(@Inject(AccreditationService) private readonly accreditation: AccreditationService) {}

  @Post(':recordId/issue')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  issue(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('recordId') recordId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CredentialActionResponse> {
    return this.accreditation.issue({
      recordId,
      actorId: identity.personId,
      actorRole: identity.roles[0] ?? 'oc_staff',
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post(':recordId/reissue')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  reissue(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('recordId') recordId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CredentialActionResponse> {
    return this.accreditation.reissue({
      recordId,
      actorId: identity.personId,
      actorRole: identity.roles[0] ?? 'oc_staff',
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post(':recordId/revoke')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  revoke(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('recordId') recordId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<CredentialActionResponse> {
    return this.accreditation.revoke({
      recordId,
      actorId: identity.personId,
      actorRole: identity.roles[0] ?? 'oc_staff',
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }
}
