// Re-export shim — the real definitions live in the shared @wms/domain package
// (extracted 2026-09-04, REV-025/027/028/031). Kept at this path so every existing
// '@/domain/...' import across the app keeps working unchanged.
export type {
  AccessZone,
  AccreditationOverview,
  AccreditationRecord,
  AccreditationSummary,
  CredentialActionResponse,
  CredentialStatus,
  EligibilityStatus,
  IssueCredentialRequest,
  PhotoStatus,
  RevokeCredentialRequest,
} from '@wms/domain';
