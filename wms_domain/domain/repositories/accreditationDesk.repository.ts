// Admin accreditation-desk repository contract (A03 — WS-D / P1). The desk reads its
// queue + issues/reissues/revokes credentials through this seam only; the API
// implementation swaps in later with no UI change (§6.6).
import type {
  AccreditationOverview,
  CredentialActionResponse,
  IssueCredentialRequest,
  RevokeCredentialRequest,
} from '../models/accreditationDesk';

export interface AccreditationDeskRepository {
  /** GET — the review queue + issued/revoked summary. */
  getOverview(): Promise<AccreditationOverview>;
  /** POST /…/{id}/issue — issue a credential (requires photo + eligibility approved). */
  issueCredential(input: IssueCredentialRequest): Promise<CredentialActionResponse>;
  /** POST /…/{id}/reissue — re-issue with a fresh badge number (lost/damaged badge). */
  reissueCredential(input: IssueCredentialRequest): Promise<CredentialActionResponse>;
  /** POST /…/{id}/revoke — revoke an issued credential with a reason. */
  revokeCredential(input: RevokeCredentialRequest): Promise<CredentialActionResponse>;
}
