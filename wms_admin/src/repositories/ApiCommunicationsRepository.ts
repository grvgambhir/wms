import { backendRequest } from '../auth/backendRequest';
import type {
  CommunicationsOverview,
  SendBroadcastInput,
  SendBroadcastResponse,
} from '../domain/communications';
import type { CommunicationsRepository } from './CommunicationsRepository';

export class ApiCommunicationsRepository implements CommunicationsRepository {
  constructor(private readonly fallback?: CommunicationsRepository) {}

  async getOverview(): Promise<CommunicationsOverview> {
    try {
      return await backendRequest<CommunicationsOverview>('/v1/communications');
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.getOverview();
      throw caught;
    }
  }

  async sendBroadcast(input: SendBroadcastInput): Promise<SendBroadcastResponse> {
    try {
      return await backendRequest<SendBroadcastResponse>('/v1/communications/broadcasts', {
        method: 'POST',
        headers: { 'Idempotency-Key': input.idempotencyKey },
        body: JSON.stringify({
          ...(input.templateId ? { templateId: input.templateId } : {}),
          subject: input.subject,
          audienceId: input.audienceId,
          channel: input.channel,
        }),
      });
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.sendBroadcast(input);
      throw caught;
    }
  }
}

function isNetworkFailure(caught: unknown): boolean {
  return caught instanceof TypeError || (caught instanceof Error && /fetch|network|ECONNREFUSED/i.test(caught.message));
}
