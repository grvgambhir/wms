import { z } from 'zod';

import type { CopyDict } from '@/i18n';

import { ageOn, parseIsoDate, PLACEHOLDER_DOB, todayUtc } from './completeProfile';

export function createCompleteProfileSchema(copy: CopyDict) {
  return z.object({
    givenName: z.string().trim().min(1, copy.p06FirstNameRequired),
    familyName: z.string().trim().min(1, copy.p06LastNameRequired),
    dateOfBirth: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, copy.p06DobInvalid)
      .superRefine((value, ctx) => {
        if (value === PLACEHOLDER_DOB) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: copy.completeProfileDobPlaceholder });
          return;
        }
        const dob = parseIsoDate(value);
        if (!dob) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: copy.p06DobInvalid });
          return;
        }
        const today = todayUtc();
        if (dob.getTime() > today.getTime()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: copy.completeProfileDobFuture });
          return;
        }
        if (ageOn(dob, today) < 18) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: copy.completeProfileDobUnder18 });
        }
      }),
    nationality: z
      .string()
      .trim()
      .refine((value) => value.length === 0 || /^[A-Za-z]{2}$/.test(value), copy.completeProfileNationalityInvalid),
    gender: z.string(),
    phone: z.string(),
    emergencyContacts: z.array(
      z.object({
        name: z.string().trim().min(1, copy.p06EmergencyNameRequired),
        phone: z.string().trim().min(1, copy.p06EmergencyPhoneRequired),
        relationship: z.string(),
      }),
    ),
  });
}

export type CompleteProfileSchemaValues = z.infer<ReturnType<typeof createCompleteProfileSchema>>;
