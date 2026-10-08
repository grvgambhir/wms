import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, 'Enter your email or mobile number')
    .max(120, 'Identifier is too long'),
});

export const passwordLoginSchema = z.object({
  identifier: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signUpSchema = passwordLoginSchema.extend({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type PasswordLoginFormValues = z.infer<typeof passwordLoginSchema>;
export type SignUpFormValues = z.infer<typeof signUpSchema>;

export const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit verification code'),
});

export type OtpFormValues = z.infer<typeof otpSchema>;
