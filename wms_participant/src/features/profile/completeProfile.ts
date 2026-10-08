import type { MeProfile, ProfilePatchBody } from '@/auth/me';
import { isUnauthorized } from '@/auth/me';
import { RepositoryError } from '@/data/errors/repositoryError';
import type { AthleteProfile, AthleteProfileInput } from '@/domain/models/athlete';
import type { CopyDict, CopyKey } from '@/i18n';

export const PLACEHOLDER_DOB = '1900-01-01';
export const PLACEHOLDER_GIVEN_NAME = 'Pending';
export const PLACEHOLDER_FAMILY_NAME = 'User';

export type CompleteProfileContactValues = {
  name: string;
  phone: string;
  relationship: string;
};

export type CompleteProfileFormValues = {
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  nationality: string;
  gender: string;
  phone: string;
  emergencyContacts: CompleteProfileContactValues[];
};

export const PROFILE_REFUSAL_COPY = {
  'profile.date_of_birth.future': 'completeProfileDobFuture',
  'profile.date_of_birth.under_18': 'completeProfileDobUnder18',
  'profile.date_of_birth.needs_review': 'completeProfileDobNeedsReview',
  'profile.date_of_birth.placeholder': 'completeProfileDobPlaceholder',
  'profile.date_of_birth.invalid': 'p06DobInvalid',
  'profile.nationality.invalid': 'completeProfileNationalityInvalid',
  'profile.locale.invalid': 'completeProfileSaveError',
  'profile.emergency_contact.invalid': 'completeProfileSaveError',
  'profile.emergency_contact.ordinal': 'completeProfileSaveError',
  'profile.validation.invalid': 'completeProfileSaveError',
} as const satisfies Record<string, CopyKey>;

export const PROFILE_DOB_REFUSAL_KEYS = [
  'profile.date_of_birth.future',
  'profile.date_of_birth.under_18',
  'profile.date_of_birth.needs_review',
] as const;

export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function ageOn(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = on.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createIdempotencyTracker(): {
  keyFor: (payload: unknown) => string;
  reset: () => void;
} {
  let key: string | null = null;
  let fingerprint: string | null = null;
  return {
    keyFor(payload: unknown) {
      const next = JSON.stringify(payload);
      if (key && fingerprint === next) return key;
      key = newIdempotencyKey();
      fingerprint = next;
      return key;
    },
    reset() {
      key = null;
      fingerprint = null;
    },
  };
}

export function withContiguousOrdinals(
  contacts: CompleteProfileContactValues[],
): CompleteProfileContactValues[] {
  return contacts.map((contact) => ({
    name: contact.name,
    phone: contact.phone,
    relationship: contact.relationship,
  }));
}

export function buildProfilePatch(
  values: CompleteProfileFormValues,
  locale: 'en' | 'it',
): ProfilePatchBody {
  const body: ProfilePatchBody = {
    givenName: values.givenName.trim(),
    familyName: values.familyName.trim(),
    dateOfBirth: values.dateOfBirth.trim(),
    locale,
    emergencyContacts: withContiguousOrdinals(values.emergencyContacts).map((contact, index) => ({
      ordinal: index,
      name: contact.name.trim(),
      phone: contact.phone.trim(),
      ...(contact.relationship.trim() ? { relationship: contact.relationship.trim() } : {}),
    })),
  };
  const nationality = values.nationality.trim().toUpperCase();
  if (nationality) body.nationality = nationality;
  const gender = values.gender.trim();
  if (gender) body.gender = gender;
  const phone = values.phone.trim();
  if (phone) body.phone = phone;
  return body;
}

export function copyForProfileRefusal(serverKey: string, dict: CopyDict): string {
  const mapped = PROFILE_REFUSAL_COPY[serverKey as keyof typeof PROFILE_REFUSAL_COPY];
  if (mapped) return dict[mapped];
  return dict.completeProfileSaveError;
}

export function dobFieldFromRefusal(serverKey: string): boolean {
  return serverKey.startsWith('profile.date_of_birth.');
}

export function formErrorCopy(err: unknown, dict: CopyDict, online: boolean): string {
  if (err instanceof RepositoryError && err.code === 'NETWORK_ERROR') {
    return online ? dict.completeProfileUnreachable : dict.completeProfileOffline;
  }
  if (err instanceof RepositoryError && err.code === 'UNAUTHORIZED') {
    return dict.completeProfileSessionExpired;
  }
  if (err instanceof RepositoryError) {
    return copyForProfileRefusal(err.message, dict);
  }
  return dict.completeProfileSaveError;
}

export function emptyCompleteProfileValues(): CompleteProfileFormValues {
  return {
    givenName: '',
    familyName: '',
    dateOfBirth: '',
    nationality: '',
    gender: '',
    phone: '',
    emergencyContacts: [],
  };
}

export function meToFormValues(me: MeProfile): CompleteProfileFormValues {
  const placeholderName = me.givenName === PLACEHOLDER_GIVEN_NAME && me.familyName === PLACEHOLDER_FAMILY_NAME;
  const dob = me.dateOfBirth.slice(0, 10);
  return {
    givenName: placeholderName ? '' : me.givenName,
    familyName: placeholderName ? '' : me.familyName,
    dateOfBirth: dob === PLACEHOLDER_DOB ? '' : dob,
    nationality: me.nationality ?? '',
    gender: me.gender ?? '',
    phone: me.phone ?? '',
    emergencyContacts: [...me.emergencyContacts]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((contact) => ({
        name: contact.name,
        phone: contact.phone,
        relationship: contact.relationship ?? '',
      })),
  };
}

/** P06 form shape from GET /v1/me — never the Harper demo fixture. */
export function meToAthleteProfile(me: MeProfile): AthleteProfile {
  const form = meToFormValues(me);
  const first = form.emergencyContacts[0];
  return {
    id: me.id,
    firstName: form.givenName,
    lastName: form.familyName,
    dateOfBirth: form.dateOfBirth,
    nationalityCountryCode: form.nationality,
    gender: form.gender || undefined,
    email: me.email ?? '',
    phone: form.phone || undefined,
    emergencyContact: first
      ? {
          name: first.name,
          phone: first.phone,
          relationship: first.relationship || undefined,
        }
      : undefined,
  };
}

/** Map the P06 save payload onto PATCH /v1/me/profile, keeping extra emergency contacts. */
export function athleteInputToCompleteValues(
  input: AthleteProfileInput,
  existing?: Pick<MeProfile, 'emergencyContacts'> | null,
): CompleteProfileFormValues {
  const extra = [...(existing?.emergencyContacts ?? [])]
    .sort((a, b) => a.ordinal - b.ordinal)
    .slice(1)
    .map((contact) => ({
      name: contact.name,
      phone: contact.phone,
      relationship: contact.relationship ?? '',
    }));
  const first = input.emergencyContact;
  const emergencyContacts: CompleteProfileContactValues[] = [];
  if (first?.name.trim() && first.phone.trim()) {
    emergencyContacts.push({
      name: first.name,
      phone: first.phone,
      relationship: first.relationship ?? '',
    });
  }
  emergencyContacts.push(...extra);
  return {
    givenName: input.firstName,
    familyName: input.lastName,
    dateOfBirth: input.dateOfBirth,
    nationality: input.nationalityCountryCode,
    gender: input.gender ?? '',
    phone: input.phone ?? '',
    emergencyContacts,
  };
}

export async function submitCompleteProfile(args: {
  payload: ProfilePatchBody;
  tracker: { keyFor: (payload: unknown) => string };
  patch: (body: ProfilePatchBody, idempotencyKey: string) => Promise<MeProfile>;
  reauthenticate: () => Promise<void>;
}): Promise<MeProfile> {
  const key = args.tracker.keyFor(args.payload);
  try {
    return await args.patch(args.payload, key);
  } catch (err) {
    if (!isUnauthorized(err)) throw err;
    await args.reauthenticate();
    return await args.patch(args.payload, key);
  }
}
