import type {
  EvidenceGateStatus,
  EvidenceStatus,
  OrdinaryEvidenceType,
  RestrictedEvidenceType,
} from '@wms/domain';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { refuse } from '../people/refuse';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ACCESS_POLICY_RESTRICTED = 'Eligibility medical reviewers only';

export function headerKey(headers: { [key: string]: string | string[] | undefined }): string {
  const raw = headers['idempotency-key'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
}

export function requireUuid(value: string | undefined, key: string): string {
  if (!value || !UUID_RE.test(value)) refuse('VALIDATION_ERROR', key);
  return value;
}

export function iso(value: Date | string | null | undefined): string | undefined {
  if (value == null) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function asInt(value: string | number | null | undefined): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function isI18nKey(value: string): boolean {
  return /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(value.trim());
}

export function ordinaryType(kind: string): OrdinaryEvidenceType {
  if (kind === 'accreditation_photo') return 'accreditation_photo';
  if (kind === 'federation_licence') return 'federation_licence';
  if (kind === 'belt_certificate') return 'belt_certificate';
  if (kind === 'weigh_in') return 'weigh_in';
  return 'identity_document';
}

export function restrictedType(kind: string): RestrictedEvidenceType {
  return kind === 'medical_certificate' ? 'medical_certificate' : 'para_classification';
}

export function ordinaryLabel(kind: string, messageKey: string): string {
  if (kind === 'identity_document') return 'Identity document';
  if (kind === 'accreditation_photo') return 'Accreditation photo';
  if (kind === 'federation_licence') return 'Federation licence';
  if (kind === 'belt_certificate') return 'Belt certificate';
  if (kind === 'weigh_in') return 'Official weigh-in';
  return messageKey;
}

export function restrictedLabel(kind: string, messageKey: string): string {
  if (kind === 'medical_certificate') return 'Medical certificate';
  if (kind === 'para_classification') return 'Para-classification evidence';
  return messageKey;
}

export function statusFrom(
  decision: string | null | undefined,
  hasUpload: boolean,
  waived = false,
): EvidenceStatus {
  if (waived) return 'approved';
  if (decision === 'approved' || decision === 'rejected' || decision === 'under_review') {
    return decision;
  }
  return hasUpload ? 'uploaded' : 'required';
}

export function entryGate(
  items: Array<{ status: EvidenceStatus; required: boolean }>,
): EvidenceGateStatus {
  const needed = items.filter((item) => item.required);
  if (needed.length === 0) return 'not_required';
  if (needed.some((item) => item.status === 'rejected')) return 'rejected';
  if (needed.every((item) => item.status === 'approved')) return 'approved';
  if (needed.some((item) => item.status === 'uploaded' || item.status === 'under_review')) {
    return 'pending_review';
  }
  return 'required';
}

export function refuseTransition(status: EvidenceStatus, action: string): never {
  refuse('INVALID_EVIDENCE_TRANSITION', `evidence.transition.${action}.${status}`);
}

export async function personNames(
  db: Queryable,
  personIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = [...new Set(personIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const { rows } = await db.query<{ id: string; given_name: string; family_name: string }>(
    `SELECT id, given_name, family_name FROM core.person WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  return new Map(rows.map((row) => [row.id, `${row.given_name} ${row.family_name}`.trim()]));
}
