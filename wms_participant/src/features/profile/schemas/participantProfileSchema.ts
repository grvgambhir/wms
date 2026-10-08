// P06 profile form schema — same RHF + Zod pattern as features/auth/schemas.
// Messages come from useCopy() so EN/IT validation errors stay on the demo path (PLT-02).
import { z } from 'zod';

import type { CopyDict } from '@/i18n';

export function createParticipantProfileSchema(copy: CopyDict) {
  return z.object({
    firstName: z.string().trim().min(1, copy.p06FirstNameRequired),
    lastName: z.string().trim().min(1, copy.p06LastNameRequired),
    dateOfBirth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, copy.p06DobInvalid),
    nationalityCountryCode: z
      .string()
      .trim()
      .min(2, copy.p06NationalityRequired)
      .max(3, copy.p06NationalityRequired),
    email: z.string().trim().email(copy.p06EmailInvalid),
    phone: z.string().trim().min(5, copy.p06PhoneRequired),
    emergencyContactName: z.string().trim().min(1, copy.p06EmergencyNameRequired),
    emergencyContactPhone: z.string().trim().min(5, copy.p06EmergencyPhoneRequired),
  });
}

export type ParticipantProfileFormValues = z.infer<ReturnType<typeof createParticipantProfileSchema>>;
