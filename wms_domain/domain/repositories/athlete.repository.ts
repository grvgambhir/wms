import type { AthleteProfile, AthleteProfileInput } from '../models/athlete';

export interface AthleteRepository {
  /** GET /athletes/me — session athlete, or null when unauthenticated. */
  getCurrentProfile(): Promise<AthleteProfile | null>;
  /** GET /athletes/{id} */
  getProfile(id: string): Promise<AthleteProfile | null>;
  saveProfile(input: AthleteProfileInput): Promise<AthleteProfile>;
  /** PUT /athletes/{id} — same write as saveProfile; named for the REST verb map (P06). */
  updateProfile(input: AthleteProfileInput): Promise<AthleteProfile>;
}
