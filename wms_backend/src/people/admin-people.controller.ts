import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import type { Page } from '../common/pagination/keyset';
import { AdminPeopleService, type PersonListItem } from './admin-people.service';

@Controller('admin/people')
@Roles('oc_admin')
export class AdminPeopleController {
  constructor(@Inject(AdminPeopleService) private readonly adminPeople: AdminPeopleService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Page<PersonListItem>> {
    return this.adminPeople.list({ search, cursor, limit });
  }

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<PersonListItem> {
    return this.adminPeople.invite({
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
      ip: req.ip,
    });
  }

  @Post(':personId/mfa/reset')
  @HttpCode(HttpStatus.OK)
  resetMfa(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('personId') personId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ ok: true }> {
    return this.adminPeople.resetMfa({
      actorId: identity.personId,
      personId,
      ip: req.ip,
    });
  }

  @Post(':personId/invite/resend')
  @HttpCode(HttpStatus.OK)
  resendInvite(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('personId') personId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ ok: true }> {
    return this.adminPeople.resendInvite({
      actorId: identity.personId,
      personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      ip: req.ip,
    });
  }

  @Post(':personId/roles')
  @HttpCode(HttpStatus.OK)
  grant(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('personId') personId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<{ personId: string; roleCode: string; eventId: string | null }> {
    return this.adminPeople.grant({
      actorId: identity.personId,
      personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
      ip: req.ip,
    });
  }

  @Delete(':personId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async purge(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('personId') personId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.adminPeople.purge({
      actorId: identity.personId,
      personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      ip: req.ip,
    });
  }

  @Delete(':personId/roles/:roleCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('personId') personId: string,
    @Param('roleCode') roleCode: string,
    @Query('eventId') eventId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.adminPeople.revoke({
      actorId: identity.personId,
      personId,
      roleCode,
      eventId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      ip: req.ip,
    });
  }
}
