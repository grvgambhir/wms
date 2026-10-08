export type PartnerSetupMode = 'have' | 'invite' | 'find';

export function parsePartnerSetupMode(value?: string | string[]): PartnerSetupMode {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'have' || raw === 'invite' || raw === 'find') return raw;
  return 'find';
}
