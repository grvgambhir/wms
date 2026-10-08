/**
 * Invoicing surface. Finance and OC admin only — an invoice states what the OC charged, and
 * issuing one is not a participant action.
 */
import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { CurrentIdentity } from '../auth/decorators/current-identity.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/guards/auth.guard';
import type { AuthenticatedIdentity } from '../auth/identity/identity-provider';
import { refuse } from '../people/refuse';
import { InvoicingService, type InvoiceView } from './invoicing.service';

@Controller()
@Roles('finance', 'oc_admin')
export class InvoicingController {
  constructor(@Inject(InvoicingService) private readonly invoicing: InvoicingService) {}

  @Post('orders/:orderId/invoice')
  issue(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId') orderId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<InvoiceView> {
    return this.invoicing.issueForOrder({
      orderId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
    });
  }

  @Get('invoices/:invoiceId')
  get(@Param('invoiceId') invoiceId: string): Promise<InvoiceView> {
    return this.invoicing.get(invoiceId);
  }

  @Post('invoices/:invoiceId/credit-note')
  creditNote(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('invoiceId') invoiceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { reasonKey?: unknown },
  ): Promise<InvoiceView> {
    // The reason is an i18n key, never a sentence — a credit note is shown to the buyer, and
    // PLT-02 makes an English-only explanation unusable for an Italian one.
    const reasonKey = typeof body?.reasonKey === 'string' ? body.reasonKey.trim() : '';
    if (!reasonKey) refuse('VALIDATION_ERROR', 'finance.credit_note.reason_required');

    return this.invoicing.issueCreditNote({
      invoiceId,
      actorId: identity.personId,
      scope: req.idempotencyScope ?? identity.personId,
      headers: req.headers,
      reasonKey,
    });
  }
}
