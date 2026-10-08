/**
 * Promotion codes. OC-side: a participant does not apply arbitrary codes to their own order
 * through this endpoint — when self-service promo entry is built, it goes through the
 * participant journey with its own ownership scoping, not this one.
 */
import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import { refuse } from '../people/refuse';
import { PromotionsService, type AppliedPromotionView } from './promotions.service';

@Controller()
@Roles('finance', 'oc_admin')
export class PromotionsController {
  constructor(@Inject(PromotionsService) private readonly promotions: PromotionsService) {}

  @Post('orders/:orderId/promotions')
  apply(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { code?: unknown },
  ): Promise<AppliedPromotionView> {
    const code = typeof body?.code === 'string' ? body.code : '';
    if (!code.trim()) refuse('VALIDATION_ERROR', 'finance.promotion.code_required');

    return this.promotions.apply({
      orderId,
      code,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }
}
