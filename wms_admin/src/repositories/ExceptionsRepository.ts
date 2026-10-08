import type {
  ApproveExceptionRequest,
  EligibilityException,
  ExceptionsOverview,
  RejectExceptionRequest,
} from '../domain/exceptions';

export interface ExceptionsRepository {
  getOverview(): Promise<ExceptionsOverview>;
  approveException(input: ApproveExceptionRequest): Promise<EligibilityException>;
  rejectException(input: RejectExceptionRequest): Promise<EligibilityException>;
}
