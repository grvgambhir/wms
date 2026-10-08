import { z } from 'zod';

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use format YYYY-MM-DD'),
  gender: z.string().trim().optional(),
  nationalityCountryCode: z
    .string()
    .trim()
    .min(2, 'Country code is required')
    .max(3, 'Use a 2–3 letter country code'),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().optional(),
  passportNumber: z.string().trim().optional(),
  emergencyContactName: z.string().trim().min(1, 'Emergency contact name is required'),
  emergencyContactPhone: z.string().trim().min(5, 'Emergency contact phone is required'),
  emergencyContactRelationship: z.string().trim().optional(),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
