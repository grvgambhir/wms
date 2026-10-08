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
import type { AthleteSummary, PartnerRequest, TeamRoster } from '@wms/domain';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import { OC_ROLE_CODES } from '../people/profile.schema';
import { PartnerService } from './partner.service';
import { RosterService } from './roster.service';

@Controller('registration-entries')
export class RosterOnEntryController {
  constructor(@Inject(RosterService) private readonly rosters: RosterService) {}

  @Get(':entryId/rosters/:productId')
  @Roles('participant')
  getTeamRoster(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('entryId') entryId: string,
    @Param('productId') productId: string,
  ): Promise<TeamRoster> {
    return this.rosters.getTeamRoster({
      entryId,
      productId,
      personId: identity.personId,
    });
  }

  @Post(':entryId/roster-substitutions')
  @Roles('participant')
  @HttpCode(HttpStatus.OK)
  propose(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('entryId') entryId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.rosters.proposeSubstitution({
      entryId,
      personId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }
}

/** The create half of the participant-owned roster surface. */
@Controller('me/entries')
export class MyEntryTeamsController {
  constructor(@Inject(RosterService) private readonly rosters: RosterService) {}

  @Post(':entryId/team')
  @Roles('participant')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('entryId') entryId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rosters.createTeam({
      entryId,
      personId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }
}

@Controller('teams')
export class TeamsController {
  constructor(@Inject(RosterService) private readonly rosters: RosterService) {}

  @Post(':teamId/invitations')
  @Roles('participant')
  @HttpCode(HttpStatus.OK)
  invite(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.rosters.invite({
      teamId,
      personId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }

  @Post(':teamId/lock')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  lock(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('teamId') teamId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rosters.lockTeam({
      teamId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }
}

@Controller('team-invitations')
export class TeamInvitationsController {
  constructor(@Inject(RosterService) private readonly rosters: RosterService) {}

  @Post(':invitationId/accept')
  @Roles('participant')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('invitationId') invitationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rosters.respondInvitation({
      invitationId,
      personId: identity.personId,
      decision: 'accepted',
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post(':invitationId/decline')
  @Roles('participant')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('invitationId') invitationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rosters.respondInvitation({
      invitationId,
      personId: identity.personId,
      decision: 'declined',
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post(':invitationId/cancel')
  @Roles('participant')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('invitationId') invitationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rosters.cancelInvitation({
      invitationId,
      personId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }
}

@Controller('me/invitations')
export class MyInvitationsController {
  constructor(
    @Inject(RosterService) private readonly rosters: RosterService,
    @Inject(PartnerService) private readonly partners: PartnerService,
  ) {}

  @Get()
  @Roles('participant')
  async list(@CurrentIdentity() identity: AuthenticatedIdentity) {
    const [teams, partners] = await Promise.all([
      this.rosters.listIncomingInvitations(identity.personId),
      this.partners.listIncomingInvitations(identity.personId),
    ]);
    return [...partners, ...teams].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

@Controller('roster-versions')
export class RosterVersionsController {
  constructor(@Inject(RosterService) private readonly rosters: RosterService) {}

  @Post(':versionId/publish')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  publish(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('versionId') versionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rosters.publishVersion({
      versionId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }
}

@Controller('roster-substitutions')
export class RosterSubstitutionsController {
  constructor(@Inject(RosterService) private readonly rosters: RosterService) {}

  @Get('review-queue')
  @Roles(...OC_ROLE_CODES)
  reviewQueue() {
    return this.rosters.reviewQueue();
  }

  @Post(':substitutionId/approve')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('substitutionId') substitutionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rosters.approveSubstitution({
      substitutionId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  /**
   * CMP-04. Records the category and accreditation checks a Games-time substitution cannot be
   * approved without. Approval (and `force`, which calls the same path) is refused by the
   * database until this has run after the lock.
   */
  @Post(':substitutionId/revalidate')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  revalidate(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('substitutionId') substitutionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rosters.revalidateSubstitution({
      substitutionId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post(':substitutionId/force')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  force(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('substitutionId') substitutionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.rosters.approveSubstitution({
      substitutionId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }
}

@Controller('partner-requests')
export class PartnerRequestsController {
  constructor(@Inject(PartnerService) private readonly partners: PartnerService) {}

  @Get()
  @Roles('participant')
  list(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('eventId') eventId?: string,
  ): Promise<PartnerRequest[]> {
    return this.partners.list(eventId ?? '', identity.personId);
  }

  @Get('candidates')
  @Roles('participant')
  search(
    @Query('eventId') eventId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('sportId') sportId?: string,
    @Query('query') query?: string,
  ): Promise<AthleteSummary[]> {
    return this.partners.search({
      eventId: eventId ?? '',
      categoryId: categoryId ?? '',
      sportId,
      query,
    });
  }

  @Post()
  @Roles('participant')
  @HttpCode(HttpStatus.OK)
  send(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<PartnerRequest> {
    return this.partners.send({
      personId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }

  @Post('cancel-outgoing')
  @Roles('participant')
  @HttpCode(HttpStatus.OK)
  cancelOutgoing(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Body() body: { eventId?: string; exceptToAthleteId?: string },
  ): Promise<void> {
    return this.partners.cancelPendingOutgoing({
      eventId: body.eventId ?? '',
      personId: identity.personId,
      exceptToAthleteId: body.exceptToAthleteId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post(':requestId')
  @Roles('participant')
  @HttpCode(HttpStatus.OK)
  respond(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('requestId') requestId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<PartnerRequest> {
    return this.partners.respond({
      requestId,
      personId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }
}
