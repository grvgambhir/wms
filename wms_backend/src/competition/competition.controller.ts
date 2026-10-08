/**
 * CMP-01 / CMP-06 surface.
 *
 * Two controllers, and the split is the requirement rather than tidiness. The public one
 * serves ONLY published, un-embargoed lists and takes no role — a start list is public by
 * design, because an athlete has to know who they are racing. The OC one can see drafts and
 * embargoed lists and is role-gated.
 *
 * Keeping them apart means the CMP-06 guarantee is a property of the endpoint rather than a
 * filter someone has to remember to apply.
 */
import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import { OC_ROLE_CODES } from '../people/profile.schema';
import { refuse } from '../people/refuse';
import {
  CategoryCombinationService,
  type CategoryCombinationView,
} from './category-combination.service';
import { StartListService, type StartListView } from './start-list.service';

@Controller('start-lists')
@Roles('participant', ...OC_ROLE_CODES)
export class StartListsPublicController {
  constructor(@Inject(StartListService) private readonly startLists: StartListService) {}

  /**
   * Published and past embargo only — for everyone, OC included. An OC user wanting a draft
   * uses the OC route, which says so.
   */
  @Get()
  published(
    @Query('eventId') eventId: string,
    @Query('sportEntryProductId') sportEntryProductId?: string,
  ): Promise<StartListView[]> {
    if (!eventId) refuse('VALIDATION_ERROR', 'competition.start_list.event_required');
    return this.startLists.published({ eventId, sportEntryProductId });
  }
}

@Controller('admin/start-lists')
@Roles(...OC_ROLE_CODES)
export class StartListsAdminController {
  constructor(@Inject(StartListService) private readonly startLists: StartListService) {}

  @Post()
  build(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Body() body: { sportEntryProductId?: unknown; categoryName?: unknown },
  ): Promise<StartListView> {
    const productId = typeof body?.sportEntryProductId === 'string' ? body.sportEntryProductId : '';
    if (!productId) refuse('VALIDATION_ERROR', 'competition.start_list.product_required');
    return this.startLists.build({
      sportEntryProductId: productId,
      categoryName: typeof body?.categoryName === 'string' ? body.categoryName : null,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Get(':startListId')
  get(@Param('startListId') startListId: string): Promise<StartListView> {
    return this.startLists.get(startListId);
  }

  @Post(':startListId/approve')
  approve(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('startListId') startListId: string,
  ): Promise<StartListView> {
    return this.startLists.approve({ startListId, actorId: identity.personId });
  }

  @Post(':startListId/publish')
  publish(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('startListId') startListId: string,
    @Body() body: { embargoUntil?: unknown; correctionReasonKey?: unknown },
  ): Promise<StartListView> {
    return this.startLists.publish({
      startListId,
      actorId: identity.personId,
      embargoUntil: typeof body?.embargoUntil === 'string' ? body.embargoUntil : null,
      correctionReasonKey:
        typeof body?.correctionReasonKey === 'string' ? body.correctionReasonKey : null,
    });
  }
}

/**
 * CMP-03. OC-only: combining categories is a competition decision with medal consequences.
 * The public sees the result through the start list, which carries the combination and its
 * published explanation — there is deliberately no separate public route.
 */
@Controller('admin/category-combinations')
@Roles(...OC_ROLE_CODES)
export class CategoryCombinationsAdminController {
  constructor(
    @Inject(CategoryCombinationService) private readonly combinations: CategoryCombinationService,
  ) {}

  @Post()
  combine(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      sportEntryProductId?: unknown;
      combinedKey?: unknown;
      sourceKeys?: unknown;
      minEntries?: unknown;
      reason?: unknown;
      reasonKey?: unknown;
    },
  ): Promise<CategoryCombinationView> {
    const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    const productId = str(body?.sportEntryProductId);
    const combinedKey = str(body?.combinedKey);
    const reason = str(body?.reason);
    const reasonKey = str(body?.reasonKey);
    const sourceKeys = Array.isArray(body?.sourceKeys)
      ? body.sourceKeys.filter((key): key is string => typeof key === 'string')
      : [];
    if (!productId || !combinedKey || !reason || !reasonKey) {
      refuse('VALIDATION_ERROR', 'competition.combination.invalid');
    }
    return this.combinations.combine({
      sportEntryProductId: productId,
      combinedKey,
      sourceKeys,
      minEntries: typeof body?.minEntries === 'number' ? body.minEntries : null,
      reason,
      reasonKey,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Get()
  list(
    @Query('sportEntryProductId') sportEntryProductId: string,
  ): Promise<CategoryCombinationView[]> {
    if (!sportEntryProductId)
      refuse('VALIDATION_ERROR', 'competition.combination.product_required');
    return this.combinations.list(sportEntryProductId);
  }
}
