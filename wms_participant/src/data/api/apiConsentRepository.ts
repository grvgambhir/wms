/**
 * HTTP client for participant consents against wms_backend GET/POST /v1/me/consents.
 * MockConsentRepository stays as the offline fallback, matching the other Api* repos.
 */
import { backendRequest } from '@/data/api/wmsBackend';
import { isNetworkError } from '@/auth/me';
import type {
  ConsentActionRequest,
  ConsentActionResponse,
  ConsentKind,
  ConsentListResponse,
  ConsentRecord,
} from '@/domain/models/consent';
import type { ConsentRepository } from '@/domain/repositories/consent.repository';

const CONSENT_KINDS: readonly ConsentKind[] = [
  'terms_and_conditions',
  'privacy_policy',
  'eligibility_medical_evidence',
  'photo_media_accreditation',
  'marketing_communications',
];

function isKind(value: string): value is ConsentKind {
  return (CONSENT_KINDS as readonly string[]).includes(value);
}

export class ApiConsentRepository implements ConsentRepository {
  private lastById = new Map<string, ConsentRecord>();

  constructor(private readonly fallback: ConsentRepository) {}

  async getConsents(participantId: string): Promise<ConsentListResponse> {
    try {
      const list = await backendRequest<ConsentListResponse>('/v1/me/consents');
      this.remember(list.items);
      return list;
    } catch {
      return this.fallback.getConsents(participantId);
    }
  }

  async grantConsent(input: ConsentActionRequest): Promise<ConsentActionResponse> {
    return this.write(input, true);
  }

  async withdrawConsent(input: ConsentActionRequest): Promise<ConsentActionResponse> {
    return this.write(input, false);
  }

  private async write(input: ConsentActionRequest, granted: boolean): Promise<ConsentActionResponse> {
    const known = this.lastById.get(input.consentId);
    const kind = known?.kind ?? (isKind(input.consentId) ? input.consentId : null);
    if (!kind) {
      return granted
        ? this.fallback.grantConsent(input)
        : this.fallback.withdrawConsent(input);
    }
    try {
      const record = await backendRequest<ConsentRecord>('/v1/me/consents', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          granted,
          version: known?.policyVersion,
        }),
        idempotencyKey: input.idempotencyKey,
      });
      this.lastById.set(record.id, record);
      return { record };
    } catch (err) {
      if (isNetworkError(err)) {
        return granted
          ? this.fallback.grantConsent(input)
          : this.fallback.withdrawConsent(input);
      }
      throw err;
    }
  }

  private remember(items: ConsentRecord[]): void {
    this.lastById.clear();
    for (const item of items) {
      this.lastById.set(item.id, item);
    }
  }
}
