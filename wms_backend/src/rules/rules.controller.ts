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
import type { MultiDimensionDerivation, RuleChangeNotice, SportRule } from '@wms/domain';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import { OC_ROLE_CODES } from '../people/profile.schema';
import { toSportRule } from './load';
import {
  RulesService,
  type CategoryCheckProduct,
  type CategoryCheckResult,
  type ImpactAnalysisView,
  type RegistrationOptions,
  type RulesOverview,
} from './rules.service';

@Controller('rules')
export class RulesController {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  @Get()
  list(@Query('sport') sport?: string, @Query('event') event?: string): Promise<SportRule[]> {
    return this.rules.listRules(sport, event);
  }

  @Get('changes/latest')
  latestChange(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('sport') sport?: string,
    @Query('event') event?: string,
  ): Promise<RuleChangeNotice | null> {
    return this.rules.latestNotice(sport, event, identity.personId);
  }

  @Post('changes/:noticeId/acknowledge')
  @HttpCode(HttpStatus.OK)
  acknowledge(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('noticeId') noticeId: string,
  ): Promise<RuleChangeNotice> {
    return this.rules.acknowledgeChange(identity.personId, noticeId);
  }

  @Post('changes')
  @Roles(...OC_ROLE_CODES)
  @HttpCode(HttpStatus.OK)
  publishChange(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<RuleChangeNotice> {
    return this.rules.publishFromNotice({
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Promise<SportRule> {
    return this.rules.getRule(id);
  }
}

@Controller('sport-entry-products')
export class ProductRulesController {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  @Get(':productId/rule-version')
  async activeVersion(@Param('productId') productId: string): Promise<{
    ruleVersionId: string;
    ruleSetId: string;
    sport: string;
    event?: string;
    version: string;
    status: string;
    referenceDate: string;
    rule: SportRule;
    dimensions: unknown;
    eligibility: unknown;
  }> {
    const loaded = await this.rules.getActiveForProduct(productId);
    const age = loaded.dimensions.find((d) => d.attribute === 'age');
    return {
      ruleVersionId: loaded.header.id,
      ruleSetId: loaded.header.rule_set_id,
      sport: loaded.header.sport_name,
      event: loaded.header.event_name ?? undefined,
      version: loaded.header.reason ?? `v${loaded.header.version_no}.0`,
      status: loaded.header.status,
      referenceDate: loaded.header.reference_date,
      rule: toSportRule(loaded.header, age),
      dimensions: loaded.dimensions,
      eligibility: loaded.eligibility,
    };
  }
}

@Controller('me/registration-options')
export class MyRegistrationOptionsController {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  /** The participant's catalogue: products open to them, with their own category preview. */
  @Get()
  @Roles('participant')
  options(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('eventId') eventId?: string,
  ): Promise<RegistrationOptions> {
    return this.rules.registrationOptions(identity.personId, eventId);
  }
}

@Controller('registration-entries')
export class EntryDerivationController {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  @Get(':entryId/category-derivation')
  derivation(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('entryId') entryId: string,
  ): Promise<MultiDimensionDerivation> {
    return this.rules.deriveForEntry(identity, entryId);
  }
}

@Controller('admin/rules')
@Roles(...OC_ROLE_CODES)
export class AdminRulesOverviewController {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  @Get('category-check/products')
  categoryCheckProducts(): Promise<CategoryCheckProduct[]> {
    return this.rules.categoryCheckProducts();
  }

  /** POST because a crew check carries up to 20 dates of birth, which do not belong in a URL. */
  @Post('category-check')
  @HttpCode(HttpStatus.OK)
  categoryCheck(@Body() body: unknown): Promise<CategoryCheckResult> {
    return this.rules.categoryCheck(body);
  }

  @Get('overview')
  overview(@Query('sport') sport?: string, @Query('event') event?: string): Promise<RulesOverview> {
    return this.rules.overview(sport, event);
  }
}

@Controller('admin/rule-sets')
@Roles(...OC_ROLE_CODES)
export class AdminRuleSetsController {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  @Post(':ruleSetId/versions')
  @HttpCode(HttpStatus.CREATED)
  createDraft(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('ruleSetId') ruleSetId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<{ versionId: string; versionLabel: string; rule: SportRule }> {
    return this.rules.createDraft({
      actorId: identity.personId,
      ruleSetId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      body,
    });
  }
}

@Controller('admin/rule-versions')
@Roles(...OC_ROLE_CODES)
export class AdminRuleVersionsController {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  @Post(':versionId/preview-derivation')
  @HttpCode(HttpStatus.OK)
  preview(
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ): Promise<MultiDimensionDerivation> {
    return this.rules.previewDerivation(versionId, body);
  }

  @Patch(':versionId')
  patch(@Param('versionId') versionId: string, @Body() body: unknown): Promise<SportRule> {
    return this.rules.patchAgeDimension({ versionId, body });
  }

  @Post(':versionId/impact-analysis')
  @HttpCode(HttpStatus.OK)
  analyze(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('versionId') versionId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ImpactAnalysisView> {
    return this.rules.analyzeImpact({
      actorId: identity.personId,
      versionId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post(':versionId/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('versionId') versionId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ rule: SportRule; notice: RuleChangeNotice }> {
    return this.rules.publish({
      actorId: identity.personId,
      versionId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }
}
