import exceptionsJson from '../data/exceptions.json';
import { backendRequest } from '../auth/backendRequest';
import type {
  ApproveExceptionRequest,
  EligibilityException,
  ExceptionReviewerId,
  ExceptionsOverview,
  RejectExceptionRequest,
} from '../domain/exceptions';
import { requiredSignatures } from '../domain/exceptions';
import type { ExceptionsRepository } from './ExceptionsRepository';

const REQUEST_DELAY_MS = 120;

type SeedException = Omit<EligibilityException, 'approvers' | 'decision' | 'reasonCode'>;
const seed = exceptionsJson as unknown as { readonly items: readonly SeedException[] };

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MockExceptionsRepository implements ExceptionsRepository {
  private cases: EligibilityException[] = seed.items.map((item) => ({
    ...clone(item),
    approvers: [],
    decision: 'pending',
  }));

  // Browser talks to wms_api; vitest stays on the local seed so page tests stay deterministic.
  constructor(private readonly liveApi = import.meta.env.MODE !== 'test') {}

  async getOverview(): Promise<ExceptionsOverview> {
    await this.delay();
    if (this.liveApi) await this.hydrateFromApi();
    return clone({ cases: this.cases });
  }

  async approveException(input: ApproveExceptionRequest): Promise<EligibilityException> {
    await this.delay();
    const current = this.find(input.exceptionId);
    if (current.decision !== 'pending') {
      throw new Error('Only a pending exception can be approved.');
    }
    if (current.approvers.includes(input.reviewerId)) {
      return this.confirmLive(`/exceptions/${input.exceptionId}/approve`, { reviewerId: input.reviewerId }, current);
    }

    const approvers: ExceptionReviewerId[] = [...current.approvers, input.reviewerId];
    const updated: EligibilityException = {
      ...current,
      approvers,
      decision: approvers.length >= requiredSignatures(current.impact) ? 'approved' : 'pending',
    };
    this.replace(updated);
    return this.confirmLive(`/exceptions/${input.exceptionId}/approve`, { reviewerId: input.reviewerId }, updated);
  }

  async rejectException(input: RejectExceptionRequest): Promise<EligibilityException> {
    await this.delay();
    const current = this.find(input.exceptionId);
    if (current.decision !== 'pending') {
      throw new Error('Only a pending exception can be rejected.');
    }

    const updated: EligibilityException = {
      ...current,
      decision: 'rejected',
      reasonCode: input.reasonCode,
    };
    this.replace(updated);
    return this.confirmLive(`/exceptions/${input.exceptionId}/reject`, { reasonCode: input.reasonCode }, updated);
  }

  /**
   * Prefer wms_api as the live review queue. Failures (API down) leave the local seed in place.
   */
  private async hydrateFromApi(): Promise<void> {
    try {
      const remote = await backendRequest<ExceptionsOverview>('/v1/exceptions');
      this.cases = clone(remote.cases) as EligibilityException[];
    } catch {
      // Local seed still renders if wms_api is unreachable.
    }
  }

  /**
   * After the local gate and signature math succeed, confirm against wms_api. The API
   * case wins when reachable; a failed write keeps the locally computed result.
   */
  private async confirmLive(
    path: string,
    body: Record<string, unknown>,
    local: EligibilityException,
  ): Promise<EligibilityException> {
    if (!this.liveApi) return clone(local);
    try {
      const remote = await backendRequest<EligibilityException>(`/v1${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      this.replace(remote);
      return clone(remote);
    } catch {
      return clone(local);
    }
  }

  private find(exceptionId: string): EligibilityException {
    const exception = this.cases.find((item) => item.id === exceptionId);
    if (!exception) throw new Error('Exception was not found.');
    return exception;
  }

  private replace(updated: EligibilityException): void {
    this.cases = this.cases.map((item) => item.id === updated.id ? updated : item);
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }
}
