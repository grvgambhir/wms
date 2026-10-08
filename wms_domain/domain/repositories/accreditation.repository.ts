import type { Accreditation } from '../models/accreditation';
import type { AccreditationRecord } from '../models/accreditationDesk';

export interface AccreditationRepository {
  getAccreditation(registrationId: string): Promise<Accreditation | null>;
  issueAccreditation(registrationId: string): Promise<Accreditation>;
  /**
   * GET /accreditations/{athleteId} — this participant's own credential record, the
   * same one the OC acts on at the accreditation desk. Scoped to a single athlete so
   * a participant never receives anyone else's record. Null before a record exists.
   */
  getPassForAthlete(athleteId: string): Promise<AccreditationRecord | null>;
}
