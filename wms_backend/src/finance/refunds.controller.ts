/**
 * Refund surface. `finance` and `oc_admin` only — `oc_staff` reaching a refund endpoint would
 * be a finding, not a convenience.
 */
import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import { refuse } from '../people/refuse';
import { RefundsService, type RefundView, type RequestedAllocation } from './refunds.service';

function reasonKeyOf(body: { reasonKey?: unknown }): string {
  // An i18n key, never a sentence: a refund decision is shown to the buyer (PLT-02), and
  // reporting on WHY refunds happen needs a code rather than prose.
  const value = typeof body?.reasonKey === 'string' ? body.reasonKey.trim() : '';
  if (!value) refuse('VALIDATION_ERROR', 'finance.refund.reason_required');
  return value;
}

@Controller()
@Roles('finance', 'oc_admin')
export class RefundsController {
  constructor(@Inject(RefundsService) private readonly refunds: RefundsService) {}

  @Post('orders/:orderId/refunds')
  request(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { amountMinor?: unknown; reasonKey?: unknown },
  ): Promise<RefundView> {
    const amountMinor = typeof body?.amountMinor === 'number' ? body.amountMinor : NaN;
    return this.refunds.request({
      orderId,
      amountMinor,
      reasonKey: reasonKeyOf(body),
      requestedBy: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post('refunds/:refundId/approve')
  approve(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('refundId') refundId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { allocations?: unknown },
  ): Promise<RefundView> {
    const raw = Array.isArray(body?.allocations) ? body.allocations : [];
    const allocations: RequestedAllocation[] = raw.map((row) => {
      const entry = row as { orderLineId?: unknown; amountMinor?: unknown };
      if (typeof entry?.orderLineId !== 'string' || typeof entry?.amountMinor !== 'number') {
        refuse('VALIDATION_ERROR', 'finance.refund.allocation_invalid');
      }
      return { orderLineId: entry.orderLineId as string, amountMinor: entry.amountMinor as number };
    });
    if (allocations.length === 0) {
      refuse('VALIDATION_ERROR', 'finance.refund.allocation_required');
    }

    return this.refunds.approve({
      refundId,
      approvedBy: identity.personId,
      allocations,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Post('refunds/:refundId/reject')
  reject(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('refundId') refundId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { reasonKey?: unknown },
  ): Promise<RefundView> {
    return this.refunds.reject({
      refundId,
      rejectedBy: identity.personId,
      reasonKey: reasonKeyOf(body),
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Get('refunds/:refundId')
  get(@Param('refundId') refundId: string): Promise<RefundView> {
    return this.refunds.get(refundId);
  }
}
