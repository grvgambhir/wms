/**
 * PostgreSQL-backed registration journey HTTP surface. Participant identity and
 * idempotency scope come from the access token; caller-supplied athlete ids are ignored.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  EntryDecision,
  ExportParticipantEntryResponse,
  JourneyEntryStatus,
  PayOrderResponse,
  RegistrationEntry,
  RegistrationJourneySnapshot,
  WaitlistActionResponse,
} from '@wms/domain';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import { RepositoryError } from '../common/errors/repositoryError';
import { OC_ROLE_CODES } from '../people/profile.schema';
import { PostgresRegistrationJourneyRepository } from './postgres-registration-journey.repository';
import { ExceptionsService } from '../ops/exceptions.service';

type HeadersMap = { [key: string]: string | string[] | undefined };

function idempotencyKey(headers: HeadersMap, bodyKey?: unknown): string {
  const raw = headers['idempotency-key'];
  const header = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return (header ?? (typeof bodyKey === 'string' ? bodyKey : '')).trim();
}

function isOc(identity: AuthenticatedIdentity): boolean {
  return identity.roles.some((role) => (OC_ROLE_CODES as readonly string[]).includes(role));
}

function targetForAction(action: string, supplied?: JourneyEntryStatus): JourneyEntryStatus | null {
  const fixed: Record<string, JourneyEntryStatus> = {
    withdraw: 'withdrawn',
    cancel: 'cancelled',
    disqualify: 'disqualified',
    substitute: 'substituted',
  };
  if (fixed[action]) return fixed[action];
  if (action === 'reinstate' && (supplied === 'draft' || supplied === 'confirmed')) return supplied;
  return null;
}

@Controller('registration-journeys')
export class RegistrationJourneysController {
  constructor(
    @Inject(PostgresRegistrationJourneyRepository)
    private readonly journeys: PostgresRegistrationJourneyRepository,
  ) {}

  @Get(':entryId')
  getJourney(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('entryId') entryId: string,
    @Query('eventId') eventId?: string,
  ): Promise<RegistrationJourneySnapshot> {
    if (!eventId) {
      throw new RepositoryError({
        code: 'VALIDATION_ERROR',
        message: 'eventId query param is required.',
      });
    }
    return this.journeys.getJourney({
      registrationEntryId: entryId,
      eventId,
      athleteId: identity.personId,
    });
  }
}

/**
 * Starting a registration. The athlete is always the token's person — there is no athlete id in
 * the body, which is what stops one participant opening an entry in someone else's name.
 * `GET /v1/me/entries` (the list) lives on `MeController`; this is its write half.
 */
@Controller('me/entries')
export class MyEntriesController {
  constructor(
    @Inject(PostgresRegistrationJourneyRepository)
    private readonly journeys: PostgresRegistrationJourneyRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('participant')
  create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Headers() headers: HeadersMap,
    @Body() body: { sportEntryProductId?: unknown; grade?: unknown; idempotencyKey?: string },
  ): Promise<RegistrationEntry> {
    const productId = typeof body?.sportEntryProductId === 'string' ? body.sportEntryProductId : '';
    const grade = typeof body?.grade === 'string' ? body.grade : '';
    if (!productId || !grade) {
      throw new RepositoryError({
        code: 'VALIDATION_ERROR',
        message: 'sportEntryProductId and grade are required.',
      });
    }
    return this.journeys.createEntry({
      sportEntryProductId: productId,
      grade,
      idempotencyKey: idempotencyKey(headers, body.idempotencyKey),
      actorId: identity.personId,
      scope: identity.personId,
    });
  }
}

@Controller('registration-entries')
export class RegistrationEntriesController {
  constructor(
    @Inject(PostgresRegistrationJourneyRepository)
    private readonly journeys: PostgresRegistrationJourneyRepository,
    @Inject(ExceptionsService) private readonly exceptions: ExceptionsService,
  ) {}

  @Post(':entryId/exceptions')
  @Roles('participant')
  @HttpCode(HttpStatus.CREATED)
  raiseException(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('entryId') entryId: string,
    @Headers() headers: HeadersMap,
  ) {
    return this.exceptions.raise({
      entryId,
      actorId: identity.personId,
      scope: identity.personId,
      headers,
    });
  }

  @Put(':entryId')
  @Roles('participant')
  saveEntry(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('entryId') entryId: string,
    @Headers() headers: HeadersMap,
    @Body()
    body: {
      sportEntryProductId?: string;
      partnerAthleteId?: string;
      grade?: 'competitive' | 'recreational';
      teamRosterId?: string;
      rosterMemberIds?: string[];
      idempotencyKey?: string;
    },
  ): Promise<EntryDecision> {
    if (!body.sportEntryProductId || !body.grade) {
      throw new RepositoryError({
        code: 'VALIDATION_ERROR',
        message: 'sportEntryProductId and grade are required.',
      });
    }
    return this.journeys.saveEntry({
      registrationEntryId: entryId,
      sportEntryProductId: body.sportEntryProductId,
      partnerAthleteId: body.partnerAthleteId,
      grade: body.grade,
      teamRosterId: body.teamRosterId,
      rosterMemberIds: body.rosterMemberIds,
      idempotencyKey: idempotencyKey(headers, body.idempotencyKey),
      actorId: identity.personId,
      scope: identity.personId,
    });
  }

  @Patch(':entryId/evidence-status')
  @Roles('participant')
  updateEvidenceStatus(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('entryId') entryId: string,
    @Body() body: { evidenceStatus?: RegistrationEntry['evidenceStatus'] },
  ): Promise<RegistrationEntry> {
    if (!body.evidenceStatus) {
      throw new RepositoryError({
        code: 'VALIDATION_ERROR',
        message: 'evidenceStatus is required.',
      });
    }
    return this.journeys.updateEvidenceStatus({
      registrationEntryId: entryId,
      evidenceStatus: body.evidenceStatus,
      actorId: identity.personId,
      scope: identity.personId,
    });
  }

  @Post(':entryId/status/:action')
  @HttpCode(HttpStatus.OK)
  @Roles('participant', ...OC_ROLE_CODES)
  async transitionStatus(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('entryId') entryId: string,
    @Param('action') action: string,
    @Headers() headers: HeadersMap,
    @Body()
    body: {
      toStatus?: JourneyEntryStatus;
      actor?: 'participant' | 'admin' | 'system';
      reason?: string;
      idempotencyKey?: string;
    },
  ): Promise<RegistrationEntry> {
    let toStatus = targetForAction(action, body.toStatus);
    if (action === 'reinstate' && !toStatus && isOc(identity)) {
      const current = await this.journeys.getEntry(entryId);
      toStatus = current?.status === 'disqualified' ? 'confirmed' : current ? 'draft' : null;
    }
    if (!toStatus) {
      throw new RepositoryError({
        code: 'ILLEGAL_STATUS_TRANSITION',
        message: `Cannot apply action ${action} to this entry.`,
      });
    }

    const adminAction = action !== 'withdraw';
    if (adminAction && !isOc(identity)) throw new ForbiddenException();
    if (!adminAction && !identity.roles.includes('participant')) throw new ForbiddenException();
    const actor = adminAction ? 'admin' : 'participant';
    return this.journeys.transitionEntryStatus({
      registrationEntryId: entryId,
      toStatus,
      actor,
      reason: body.reason,
      idempotencyKey: idempotencyKey(headers, body.idempotencyKey),
      actorId: identity.personId,
      scope: identity.personId,
      requireOwner: !adminAction,
    });
  }

  @Get(':entryId/exports/participant-safe')
  exportParticipantSafe(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('entryId') entryId: string,
  ): Promise<ExportParticipantEntryResponse> {
    return this.journeys.exportParticipantEntry({
      registrationEntryId: entryId,
      athleteId: identity.personId,
    });
  }

  /**
   * `getEntry` has no SQL ownership check — it is the admin governance panel read.
   * OC roles (`oc_staff`, `oc_admin`, `finance`) rather than caller-scoping, because
   * the panel has to open any entry and a participant token must not.
   */
  @Get(':entryId')
  @Roles(...OC_ROLE_CODES)
  async getEntry(@Param('entryId') entryId: string): Promise<RegistrationEntry> {
    const entry = await this.journeys.getEntry(entryId);
    if (!entry) {
      throw new RepositoryError({
        code: 'REGISTRATION_ENTRY_NOT_FOUND',
        message: 'No registration entry for this participant.',
      });
    }
    return entry;
  }
}

@Controller('waitlists')
export class WaitlistsController {
  constructor(
    @Inject(PostgresRegistrationJourneyRepository)
    private readonly journeys: PostgresRegistrationJourneyRepository,
  ) {}

  @Get('review-queue')
  @Roles(...OC_ROLE_CODES)
  async reviewQueue(): Promise<{
    items: Array<{
      id: string;
      entryId: string;
      athleteName: string;
      sportName: string;
      productName: string;
      status: string;
      position: number | null;
      offerExpiresAt: string | null;
      joinedAt: string | null;
    }>;
  }> {
    return { items: await this.journeys.listWaitlistQueue() };
  }

  @Post(':waitlistId/join')
  @HttpCode(HttpStatus.OK)
  @Roles('participant')
  join(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('waitlistId') waitlistId: string,
    @Headers() headers: HeadersMap,
    @Body() body: { idempotencyKey?: string },
  ): Promise<WaitlistActionResponse> {
    return this.journeys.joinWaitlist({
      waitlistId,
      idempotencyKey: idempotencyKey(headers, body.idempotencyKey),
      actorId: identity.personId,
      scope: identity.personId,
      requireOwner: true,
    });
  }

  @Post(':waitlistId/release-offer')
  @HttpCode(HttpStatus.OK)
  @Roles(...OC_ROLE_CODES)
  release(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('waitlistId') waitlistId: string,
    @Headers() headers: HeadersMap,
    @Body() body: { idempotencyKey?: string },
  ): Promise<WaitlistActionResponse> {
    return this.journeys.releaseWaitlistOffer({
      waitlistId,
      idempotencyKey: idempotencyKey(headers, body.idempotencyKey),
      actorId: identity.personId,
      scope: identity.personId,
      requireOwner: false,
    });
  }

  @Post(':waitlistId/expire-offer')
  @HttpCode(HttpStatus.OK)
  @Roles(...OC_ROLE_CODES)
  expire(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('waitlistId') waitlistId: string,
    @Headers() headers: HeadersMap,
    @Body() body: { idempotencyKey?: string },
  ): Promise<WaitlistActionResponse> {
    return this.journeys.expireWaitlistOffer({
      waitlistId,
      idempotencyKey: idempotencyKey(headers, body.idempotencyKey),
      actorId: identity.personId,
      scope: identity.personId,
      requireOwner: false,
    });
  }

  @Post(':waitlistId/claim-offer')
  @HttpCode(HttpStatus.OK)
  @Roles('participant')
  claim(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('waitlistId') waitlistId: string,
    @Headers() headers: HeadersMap,
    @Body() body: { idempotencyKey?: string },
  ): Promise<WaitlistActionResponse> {
    return this.journeys.claimWaitlistOffer({
      waitlistId,
      idempotencyKey: idempotencyKey(headers, body.idempotencyKey),
      actorId: identity.personId,
      scope: identity.personId,
      requireOwner: true,
    });
  }
}

@Controller('orders')
export class RegistrationOrdersController {
  constructor(
    @Inject(PostgresRegistrationJourneyRepository)
    private readonly journeys: PostgresRegistrationJourneyRepository,
  ) {}

  @Post(':orderId/payments')
  @HttpCode(HttpStatus.OK)
  @Roles('participant')
  pay(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId') orderId: string,
    @Headers() headers: HeadersMap,
    @Body()
    body: {
      idempotencyKey?: string;
      method?: 'card';
      simulateFirstAttemptTimeout?: boolean;
    },
  ): Promise<PayOrderResponse> {
    if (body.method && body.method !== 'card') {
      throw new RepositoryError({
        code: 'VALIDATION_ERROR',
        message: 'Only card payments are supported.',
      });
    }
    return this.journeys.payOrder({
      orderId,
      idempotencyKey: idempotencyKey(headers, body.idempotencyKey),
      method: 'card',
      simulateFirstAttemptTimeout: Boolean(body.simulateFirstAttemptTimeout),
      actorId: identity.personId,
      scope: identity.personId,
    });
  }
}
