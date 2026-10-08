/**
 * The participant's own message inbox, read from wms_backend.
 *
 * Token-scoped — the athlete id is not sent. Offline the inbox is empty rather
 * than faked: showing invented messages an athlete may act on would be worse
 * than showing none.
 */
import { backendRequest } from '@/data/api/wmsBackend';
import type { PaginatedResponse } from '@/domain/models/api';
import type { CommunicationRecord } from '@/domain/models/communications';
import type { ParticipantInboxRepository } from '@/domain/repositories/participantInbox.repository';

const EMPTY: PaginatedResponse<CommunicationRecord> = { items: [], total: 0 };

export class ApiParticipantInboxRepository implements ParticipantInboxRepository {
  async listInbox(_athleteId: string): Promise<PaginatedResponse<CommunicationRecord>> {
    try {
      return await backendRequest<PaginatedResponse<CommunicationRecord>>('/v1/me/inbox');
    } catch {
      return EMPTY;
    }
  }
}
