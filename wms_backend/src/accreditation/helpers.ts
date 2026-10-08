import type {
  AccessZone,
  AccreditationRecord,
  CredentialStatus,
  EligibilityStatus,
  PhotoStatus,
} from '@wms/domain';
import { refuse } from '../people/refuse';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACCESS_ZONES: readonly AccessZone[] = [
  'field-of-play',
  'athlete-lounge',
  'media',
  'officials',
  'back-of-house',
];

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

export function isoDate(value: Date | string | null | undefined): string {
  if (value == null) return '';
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

export function iso(value: Date | string | null | undefined): string | undefined {
  if (value == null) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function asPhotoStatus(value: string): PhotoStatus {
  if (value === 'approved' || value === 'rejected') return value;
  return 'submitted';
}

export function asEligibilityStatus(value: string): EligibilityStatus {
  return value === 'approved' ? 'approved' : 'pending';
}

export function asCredentialStatus(value: string): CredentialStatus {
  if (value === 'issued' || value === 'revoked') return value;
  return 'pending_review';
}

export function asAccessZones(values: string[] | null | undefined): AccessZone[] {
  return (values ?? []).filter((zone): zone is AccessZone =>
    (ACCESS_ZONES as readonly string[]).includes(zone),
  );
}

export type AccreditationRow = {
  id: string;
  person_id: string;
  given_name: string;
  family_name: string;
  nationality: string | null;
  sport_name: string | null;
  role: string;
  photo_status: string;
  eligibility_status: string;
  status: string;
  zones: string[];
  badge_number: string | null;
  valid_from: Date | string;
  valid_until: Date | string;
  issued_at: Date | string | null;
  revoked_reason: string | null;
  updated_at: Date | string;
  qr_value: string | null;
};

export function toRecord(row: AccreditationRow): AccreditationRecord {
  return {
    id: row.id,
    athleteId: row.person_id,
    participantName: `${row.given_name} ${row.family_name}`.trim(),
    nationalityCountryCode: (row.nationality ?? 'XX').toUpperCase(),
    sportName: row.sport_name ?? '',
    role: row.role,
    photoStatus: asPhotoStatus(row.photo_status),
    eligibilityStatus: asEligibilityStatus(row.eligibility_status),
    status: asCredentialStatus(row.status),
    accessZones: asAccessZones(row.zones),
    ...(row.badge_number ? { badgeNumber: row.badge_number } : {}),
    validFrom: isoDate(row.valid_from),
    validUntil: isoDate(row.valid_until),
    ...(iso(row.issued_at) ? { issuedAt: iso(row.issued_at) } : {}),
    ...(row.revoked_reason ? { revokedReason: row.revoked_reason } : {}),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
  };
}

export const SELECT_RECORD = `
  SELECT a.id, a.person_id, p.given_name, p.family_name, p.nationality,
         a.sport_name, a.role, a.photo_status, a.eligibility_status, a.status,
         a.zones, a.badge_number, a.valid_from, a.valid_until, a.issued_at,
         a.revoked_reason, a.updated_at, a.qr_value
    FROM core.accreditation a
    JOIN core.person p ON p.id = a.person_id
`;
