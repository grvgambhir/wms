export interface EmergencyContact {
  name: string;
  relationship?: string;
  phone: string;
}

export interface AthleteProfile {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationalityCountryCode: string;
  gender?: string;
  email: string;
  phone?: string;
  passportNumber?: string;
  emergencyContact?: EmergencyContact;
  profileImageUri?: string;
  /** Bundled POC portrait key (e.g. danielHarper) — reused on Profile + accreditation. */
  profileImageKey?: string;
}

export type AthleteProfileInput = Omit<AthleteProfile, 'id'> & { id?: string };

/** Lightweight athlete row for partner finder lists. */
export interface AthleteSummary {
  id: string;
  firstName: string;
  lastName: string;
  nationalityCountryCode: string;
  dateOfBirth: string;
  age: number;
  sportId?: string;
  categoryId?: string;
  experienceLabel?: string;
  profileImageKey?: string;
}
