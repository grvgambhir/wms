import type {
  AccreditationOverview,
  CredentialActionResponse,
  IssueCredentialRequest,
  RevokeCredentialRequest,
} from '../domain/accreditationDesk';

export interface AccreditationDeskRepository {
  getOverview(): Promise<AccreditationOverview>;
  issueCredential(input: IssueCredentialRequest): Promise<CredentialActionResponse>;
  reissueCredential(input: IssueCredentialRequest): Promise<CredentialActionResponse>;
  revokeCredential(input: RevokeCredentialRequest): Promise<CredentialActionResponse>;
}
