import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'profile.date_of_birth.invalid');

export const emergencyContactSchema = z.object({
  ordinal: z.number().int().min(0).max(32767),
  name: z.string().trim().min(1).max(200),
  relationship: z.string().trim().max(100).optional(),
  phone: z.string().trim().min(1).max(40),
});

export const profilePatchSchema = z.object({
  givenName: z.string().trim().min(1).max(100).optional(),
  familyName: z.string().trim().min(1).max(100).optional(),
  dateOfBirth: isoDate.optional(),
  nationality: z
    .string()
    .length(2)
    .regex(/^[A-Za-z]{2}$/, 'profile.nationality.invalid')
    .transform((value) => value.toUpperCase())
    .optional(),
  gender: z.string().trim().min(1).max(40).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
  emergencyContacts: z.array(emergencyContactSchema).max(20).optional(),
});

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export const OC_ROLE_CODES = ['oc_staff', 'oc_admin', 'finance'] as const;
export type OcRoleCode = (typeof OC_ROLE_CODES)[number];

export const adminGrantSchema = z.object({
  roleCode: z.string().trim().min(1).max(40),
  eventId: z.string().uuid().nullable().optional(),
});

export type AdminGrant = z.infer<typeof adminGrantSchema>;

export const adminInviteSchema = z.object({
  email: z.string().trim().email().max(320),
  givenName: z.string().trim().min(1).max(100),
  familyName: z.string().trim().min(1).max(100),
  roleCode: z.string().trim().min(1).max(40),
  eventId: z.string().uuid().nullable().optional(),
});

export type AdminInvite = z.infer<typeof adminInviteSchema>;

const PLACEHOLDER_DOB = '1900-01-01';
const PLACEHOLDER_GIVEN_NAME = 'Pending';
const PLACEHOLDER_FAMILY_NAME = 'User';

export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
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

export function isPlaceholderDob(value: string): boolean {
  return value === PLACEHOLDER_DOB;
}

export function hasRealName(givenName: string, familyName: string): boolean {
  if (!givenName.trim() || !familyName.trim()) return false;
  return !(givenName === PLACEHOLDER_GIVEN_NAME && familyName === PLACEHOLDER_FAMILY_NAME);
}

export function isOcRole(code: string): code is OcRoleCode {
  return (OC_ROLE_CODES as readonly string[]).includes(code);
}
