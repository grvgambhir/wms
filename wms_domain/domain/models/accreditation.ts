export type AccreditationStatus = 'pending' | 'issued' | 'disabled';

export interface Accreditation {
  id: string;
  registrationId: string;
  athleteId: string;
  eventId: string;
  badgeNumber: string;
  qrValue: string;
  accessLevel: string;
  validFrom: string;
  validUntil: string;
  status: AccreditationStatus;
}
