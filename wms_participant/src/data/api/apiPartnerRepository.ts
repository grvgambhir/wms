/**
 * HTTP client for partner-finder against wms_backend.
 * MockPartnerRepository stays as the offline fallback.
 */
import { backendRequest } from '@/data/api/wmsBackend';
import { isNetworkError } from '@/auth/me';
import { newIdempotencyKey } from '@/features/profile/completeProfile';
import type { AthleteSummary } from '@/domain/models/athlete';
import type { IncomingInvitation, PartnerFilters, PartnerRequest, PartnerRequestStatus } from '@/domain/models/partner';
import type { PartnerRepository } from '@/domain/repositories/partner.repository';

export class ApiPartnerRepository implements PartnerRepository {
  constructor(private readonly fallback: PartnerRepository) {}

  async searchPartners(filters: PartnerFilters): Promise<AthleteSummary[]> {
    const params = new URLSearchParams({
      eventId: filters.eventId,
      categoryId: filters.categoryId,
    });
    if (filters.sportId) params.set('sportId', filters.sportId);
    if (filters.query) params.set('query', filters.query);
    try {
      return await backendRequest<AthleteSummary[]>(`/v1/partner-requests/candidates?${params}`);
    } catch {
      return this.fallback.searchPartners(filters);
    }
  }

  async sendPartnerRequest(
    input: Omit<PartnerRequest, 'id' | 'status' | 'createdAt'>,
  ): Promise<PartnerRequest> {
    try {
      return await backendRequest<PartnerRequest>('/v1/partner-requests', {
        method: 'POST',
        body: JSON.stringify({
          eventId: input.eventId,
          categoryId: input.categoryId,
          toAthleteId: input.toAthleteId,
          entryId: input.entryId,
        }),
        idempotencyKey: newIdempotencyKey(),
      });
    } catch (err) {
      if (isNetworkError(err)) return this.fallback.sendPartnerRequest(input);
      throw err;
    }
  }

  async respondToPartnerRequest(
    requestId: string,
    status: PartnerRequestStatus,
  ): Promise<PartnerRequest> {
    try {
      return await backendRequest<PartnerRequest>(`/v1/partner-requests/${encodeURIComponent(requestId)}`, {
        method: 'POST',
        body: JSON.stringify({ status }),
        idempotencyKey: newIdempotencyKey(),
      });
    } catch (err) {
      if (isNetworkError(err)) return this.fallback.respondToPartnerRequest(requestId, status);
      throw err;
    }
  }

  async listRequests(eventId: string, athleteId: string): Promise<PartnerRequest[]> {
    try {
      return await backendRequest<PartnerRequest[]>(
        `/v1/partner-requests?eventId=${encodeURIComponent(eventId)}`,
      );
    } catch {
      return this.fallback.listRequests(eventId, athleteId);
    }
  }

  async cancelPendingOutgoing(
    eventId: string,
    fromAthleteId: string,
    exceptToAthleteId?: string,
  ): Promise<void> {
    try {
      await backendRequest<void>('/v1/partner-requests/cancel-outgoing', {
        method: 'POST',
        body: JSON.stringify({ eventId, exceptToAthleteId: exceptToAthleteId }),
        idempotencyKey: newIdempotencyKey(),
      });
    } catch (err) {
      if (isNetworkError(err)) {
        return this.fallback.cancelPendingOutgoing(eventId, fromAthleteId, exceptToAthleteId);
      }
      throw err;
    }
  }

  async listIncomingInvitations(): Promise<IncomingInvitation[]> {
    try {
      return await backendRequest<IncomingInvitation[]>('/v1/me/invitations');
    } catch (err) {
      if (isNetworkError(err)) return this.fallback.listIncomingInvitations();
      throw err;
    }
  }
}
