import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type {
  EligibilityEvidence,
  EvidenceMutationResponse,
  PaginatedResponse,
  RestrictedEvidence,
} from '@wms/domain';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import { OC_ROLE_CODES } from '../people/profile.schema';
import { EvidenceService } from './evidence.service';
import { RestrictedEvidenceService } from './restricted-evidence.service';

@Controller('registration-entries')
export class EvidenceOnEntryController {
  constructor(@Inject(EvidenceService) private readonly evidence: EvidenceService) {}

  @Get(':entryId/evidence')
  @Roles('participant')
  list(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('entryId') entryId: string,
    @Query('sportEntryProductId') sportEntryProductId?: string,
  ): Promise<PaginatedResponse<EligibilityEvidence>> {
    return this.evidence.listForEntry({
      entryId,
      sportEntryProductId,
      personId: identity.personId,
    });
  }
}

@Controller('evidence')
export class EvidenceController {
  constructor(@Inject(EvidenceService) private readonly evidence: EvidenceService) {}

  @Get('review-queue')
  @Roles(...OC_ROLE_CODES)
  reviewQueue(): Promise<PaginatedResponse<EligibilityEvidence>> {
    return this.evidence.reviewQueue();
  }

  @Post(':evidenceId/uploads')
  @Roles('participant')
  @HttpCode(HttpStatus.OK)
  upload(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('evidenceId') evidenceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    return this.evidence.upload({
      evidenceId,
      personId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }

  @Post(':evidenceId/review')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  startReview(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('evidenceId') evidenceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    return this.evidence.startReview({
      evidenceId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post(':evidenceId/decisions')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('evidenceId') evidenceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    return this.evidence.decide({
      evidenceId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }

  @Post(':evidenceId/waivers')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  waive(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('evidenceId') evidenceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<EvidenceMutationResponse<EligibilityEvidence>> {
    return this.evidence.waive({
      evidenceId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }
}

@Controller('restricted-evidence')
export class RestrictedEvidenceController {
  constructor(
    @Inject(RestrictedEvidenceService) private readonly restricted: RestrictedEvidenceService,
  ) {}

  @Get('review-queue')
  @Roles(...OC_ROLE_CODES)
  reviewQueue(): Promise<PaginatedResponse<RestrictedEvidence>> {
    return this.restricted.reviewQueue();
  }

  @Get()
  @Roles('participant')
  list(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('registrationEntryId') registrationEntryId?: string,
    @Query('sportEntryProductId') sportEntryProductId?: string,
  ): Promise<PaginatedResponse<RestrictedEvidence>> {
    return this.restricted.listForEntry({
      entryId: registrationEntryId ?? '',
      sportEntryProductId,
      personId: identity.personId,
    });
  }

  @Post(':evidenceId/uploads')
  @Roles('participant')
  @HttpCode(HttpStatus.OK)
  upload(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('evidenceId') evidenceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<EvidenceMutationResponse<RestrictedEvidence>> {
    return this.restricted.upload({
      evidenceId,
      personId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }

  @Post(':evidenceId/review')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  startReview(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('evidenceId') evidenceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<EvidenceMutationResponse<RestrictedEvidence>> {
    return this.restricted.startReview({
      evidenceId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post(':evidenceId/decisions')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('evidenceId') evidenceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<EvidenceMutationResponse<RestrictedEvidence>> {
    return this.restricted.decide({
      evidenceId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }

  @Post(':evidenceId/waivers')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  waive(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('evidenceId') evidenceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<EvidenceMutationResponse<RestrictedEvidence>> {
    return this.restricted.waive({
      evidenceId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }
}
