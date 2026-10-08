import type { AthleteProfile } from '@/domain/models/athlete';
import { profileSchema, type ProfileFormValues } from '@/features/athlete/schemas/profileSchema';

export function profileToForm(profile: AthleteProfile): ProfileFormValues {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender ?? '',
    nationalityCountryCode: profile.nationalityCountryCode,
    email: profile.email,
    phone: profile.phone ?? '',
    passportNumber: profile.passportNumber ?? '',
    emergencyContactName: profile.emergencyContact?.name ?? '',
    emergencyContactPhone: profile.emergencyContact?.phone ?? '',
    emergencyContactRelationship: profile.emergencyContact?.relationship ?? '',
  };
}

export function formToProfileInput(values: ProfileFormValues, athleteId?: string) {
  return {
    id: athleteId,
    firstName: values.firstName,
    lastName: values.lastName,
    dateOfBirth: values.dateOfBirth,
    gender: values.gender || undefined,
    nationalityCountryCode: values.nationalityCountryCode.toUpperCase(),
    email: values.email,
    phone: values.phone || undefined,
    passportNumber: values.passportNumber || undefined,
    emergencyContact: {
      name: values.emergencyContactName,
      phone: values.emergencyContactPhone,
      relationship: values.emergencyContactRelationship || undefined,
    },
  };
}

/** True when identity fields would pass Profile-tab validation — used to gate event registration. */
export function isAthleteProfileComplete(profile: AthleteProfile | null | undefined): boolean {
  if (!profile) return false;
  return profileSchema.safeParse(profileToForm(profile)).success;
}
