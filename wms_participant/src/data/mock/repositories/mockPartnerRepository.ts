import type { AthleteSummary } from '@/domain/models/athlete';
import type { IncomingInvitation, PartnerFilters, PartnerRequest, PartnerRequestStatus } from '@/domain/models/partner';
import type { PartnerRepository } from '@/domain/repositories/partner.repository';
import { fixtures } from '@/data/mock/fixtures';
import { getJson, setJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

async function loadRequests(): Promise<PartnerRequest[]> {
  return (await getJson<PartnerRequest[]>(storageKeys.partnerRequests)) ?? [];
}

async function saveRequests(requests: PartnerRequest[]): Promise<void> {
  await setJson(storageKeys.partnerRequests, requests);
}

export class MockPartnerRepository implements PartnerRepository {
  async searchPartners(filters: PartnerFilters): Promise<AthleteSummary[]> {
    const query = filters.query?.trim().toLowerCase();

    return fixtures.partnerCandidates.filter((candidate) => {
      if (filters.sportId && candidate.sportId !== filters.sportId) return false;

      if (query) {
        const fullName = `${candidate.firstName} ${candidate.lastName}`.toLowerCase();
        return fullName.includes(query) || candidate.nationalityCountryCode.toLowerCase().includes(query);
      }

      if (filters.categoryId && candidate.categoryId !== filters.categoryId) return false;
      return true;
    });
  }

  async sendPartnerRequest(
    input: Omit<PartnerRequest, 'id' | 'status' | 'createdAt'>,
  ): Promise<PartnerRequest> {
    const existing = await loadRequests();
    const duplicate = existing.find(
      (request) =>
        request.eventId === input.eventId &&
        request.fromAthleteId === input.fromAthleteId &&
        request.toAthleteId === input.toAthleteId &&
        (request.status === 'pending' || request.status === 'accepted'),
    );
    if (duplicate) return duplicate;

    // Always pending — the other athlete must accept (Marco is simulated in the feature hook).
    const request: PartnerRequest = {
      ...input,
      id: `partner_req_${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    existing.push(request);
    await saveRequests(existing);
    return request;
  }

  async respondToPartnerRequest(requestId: string, status: PartnerRequestStatus): Promise<PartnerRequest> {
    const existing = await loadRequests();
    const current = existing.find((request) => request.id === requestId);
    if (!current) {
      throw new Error(`Partner request not found: ${requestId}`);
    }

    const next = existing.map((request) => {
      if (request.id === requestId) {
        return { ...request, status };
      }
      if (
        status === 'accepted' &&
        request.status === 'pending' &&
        request.eventId === current.eventId &&
        request.fromAthleteId === current.fromAthleteId
      ) {
        return { ...request, status: 'cancelled' as const };
      }
      return request;
    });

    await saveRequests(next);
    return next.find((request) => request.id === requestId) ?? { ...current, status };
  }

  async listRequests(eventId: string, athleteId: string): Promise<PartnerRequest[]> {
    const existing = await loadRequests();
    return existing.filter(
      (request) =>
        request.eventId === eventId &&
        (request.fromAthleteId === athleteId || request.toAthleteId === athleteId),
    );
  }

  async cancelPendingOutgoing(
    eventId: string,
    fromAthleteId: string,
    exceptToAthleteId?: string,
  ): Promise<void> {
    const existing = await loadRequests();
    const next = existing.map((request) => {
      if (
        request.eventId === eventId &&
        request.fromAthleteId === fromAthleteId &&
        request.status === 'pending' &&
        request.toAthleteId !== exceptToAthleteId
      ) {
        return { ...request, status: 'cancelled' as const };
      }
      return request;
    });
    await saveRequests(next);
  }

  async listIncomingInvitations(): Promise<IncomingInvitation[]> {
    // The offline fixture has no authenticated second athlete. The real API is token-scoped.
    return [];
  }
}
