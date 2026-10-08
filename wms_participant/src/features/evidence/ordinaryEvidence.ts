import type { EvidenceDeclaredAttribute, OrdinaryEvidenceType } from '@/domain/models/evidence';

export function judoEvidenceDeclaration(
  type: OrdinaryEvidenceType,
  rawValue: string,
): EvidenceDeclaredAttribute | undefined {
  const value = rawValue.trim();
  if (type === 'weigh_in') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0
      ? { attribute: 'weight_kg', numericValue }
      : undefined;
  }
  if (type === 'belt_certificate') {
    return value ? { attribute: 'belt_rank', textValue: value } : undefined;
  }
  if (type === 'federation_licence') {
    const date = new Date(`${value}T00:00:00.000Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && date.toISOString().slice(0, 10) === value
      ? { attribute: 'federation_licence', textValue: 'active', validUntil: value }
      : undefined;
  }
  return undefined;
}
