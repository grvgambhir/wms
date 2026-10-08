import { z } from 'zod';

export const cognitoPasswordSchema = z.object({
  identifier: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const cognitoSignUpSchema = cognitoPasswordSchema.extend({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
});

export type CognitoPasswordFormValues = z.infer<typeof cognitoPasswordSchema>;
export type CognitoSignUpFormValues = z.infer<typeof cognitoSignUpSchema>;

export const confirmCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit verification code'),
});

export type ConfirmCodeFormValues = z.infer<typeof confirmCodeSchema>;
