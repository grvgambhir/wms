import { backendRequest } from '../auth/backendRequest';
import { newIdempotencyKey } from '../api/idempotencyKey';
import type {
  ApproveExceptionRequest,
  EligibilityException,
  ExceptionsOverview,
  RejectExceptionRequest,
} from '../domain/exceptions';
import type { ExceptionsRepository } from './ExceptionsRepository';

export class ApiExceptionsRepository implements ExceptionsRepository {
  constructor(private readonly fallback?: ExceptionsRepository) {}

  async getOverview(): Promise<ExceptionsOverview> {
    try {
      return await backendRequest<ExceptionsOverview>('/v1/exceptions');
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.getOverview();
      throw caught;
    }
  }

  async approveException(input: ApproveExceptionRequest): Promise<EligibilityException> {
    try {
      return await backendRequest<EligibilityException>(
        `/v1/exceptions/${encodeURIComponent(input.exceptionId)}/approve`,
        {
          method: 'POST',
          // One key per click, not per (case, reviewer) — a key built from those two replays
          // the first response on a second, genuinely distinct signature attempt, which is
          // exactly what CMP/RUL-06's one-signature-per-person guard needs the second attempt
          // to actually reach the server for.
          headers: { 'Idempotency-Key': newIdempotencyKey() },
          body: JSON.stringify({}),
        },
      );
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.approveException(input);
      throw caught;
    }
  }

  async rejectException(input: RejectExceptionRequest): Promise<EligibilityException> {
    try {
      return await backendRequest<EligibilityException>(
        `/v1/exceptions/${encodeURIComponent(input.exceptionId)}/reject`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': newIdempotencyKey() },
          body: JSON.stringify({ reasonCode: input.reasonCode }),
        },
      );
    } catch (caught) {
      if (this.fallback && isNetworkFailure(caught)) return this.fallback.rejectException(input);
      throw caught;
    }
  }
}

function isNetworkFailure(caught: unknown): boolean {
  return caught instanceof TypeError || (caught instanceof Error && /fetch|network|ECONNREFUSED/i.test(caught.message));
}
