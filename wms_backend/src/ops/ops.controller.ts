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
  AssistedMutationResponse,
  AssistedRegistrationOverview,
  CommunicationRecord,
  CommunicationsOverview,
  EligibilityException,
  ExceptionsOverview,
  PaginatedResponse,
  SendBroadcastResponse,
} from '@wms/domain';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import { OC_ROLE_CODES } from '../people/profile.schema';
import { AssistedService } from './assisted.service';
import { CommsService, type BroadcastDeliveryView } from './comms.service';
import { ExceptionsService } from './exceptions.service';
import { OperationsSnapshotService, type OperationsSnapshot } from './operations-snapshot.service';

@Controller('me')
export class MyInboxController {
  constructor(@Inject(CommsService) private readonly comms: CommsService) {}

  @Get('inbox')
  @Roles('participant')
  listInbox(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponse<CommunicationRecord>> {
    return this.comms.listInbox(identity.personId, cursor, limit);
  }
}

@Controller('communications')
export class CommunicationsController {
  constructor(@Inject(CommsService) private readonly comms: CommsService) {}

  @Get()
  @Roles(...OC_ROLE_CODES)
  overview(): Promise<CommunicationsOverview> {
    return this.comms.getOverview();
  }

  @Get('broadcasts/:broadcastId')
  @Roles(...OC_ROLE_CODES)
  getBroadcast(@Param('broadcastId') broadcastId: string): Promise<BroadcastDeliveryView> {
    return this.comms.getBroadcast(broadcastId);
  }

  @Post('broadcasts')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  send(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<SendBroadcastResponse> {
    return this.comms.sendBroadcast({
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }
}

@Controller('assisted-registration')
export class AssistedRegistrationController {
  constructor(@Inject(AssistedService) private readonly assisted: AssistedService) {}

  @Get()
  @Roles(...OC_ROLE_CODES)
  overview(
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ): Promise<AssistedRegistrationOverview> {
    return this.assisted.getOverview(identity.personId);
  }

  @Post('consents')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  recordConsent(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<AssistedMutationResponse> {
    return this.assisted.recordConsent({
      actorId: identity.personId,
      actorRole: identity.roles[0] ?? 'oc_staff',
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }

  @Post('actions')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  performAction(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<AssistedMutationResponse> {
    return this.assisted.performProxyAction({
      actorId: identity.personId,
      actorRole: identity.roles[0] ?? 'oc_staff',
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }
}

@Controller('exceptions')
export class ExceptionsController {
  constructor(@Inject(ExceptionsService) private readonly exceptions: ExceptionsService) {}

  @Get()
  @Roles(...OC_ROLE_CODES)
  overview(): Promise<ExceptionsOverview> {
    return this.exceptions.getOverview();
  }

  @Post(':exceptionId/approve')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('exceptionId') exceptionId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<EligibilityException> {
    return this.exceptions.approve({
      exceptionId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post(':exceptionId/reject')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('exceptionId') exceptionId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<EligibilityException> {
    return this.exceptions.reject({
      exceptionId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }
}

/**
 * OPS-03 / REG-15: the Operations dashboard reads its capacity, funnel and reconciliation figures
 * from here. Before this, the screen rendered hard-coded numbers.
 */
@Controller('admin/operations')
@Roles(...OC_ROLE_CODES)
export class AdminOperationsController {
  constructor(
    @Inject(OperationsSnapshotService) private readonly operations: OperationsSnapshotService,
  ) {}

  @Get('snapshot')
  snapshot(@Query('eventId') eventId?: string): Promise<OperationsSnapshot> {
    return this.operations.snapshot(eventId);
  }
}
