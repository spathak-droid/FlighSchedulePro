import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const mfaSchema = z.object({
  mfaToken: z.string().min(1, 'MFA token is required'),
  mfaCode: z.string().min(1, 'MFA code is required'),
  mfaMethod: z.number().int().min(1, 'MFA method is required'),
});

export type MfaDto = z.infer<typeof mfaSchema>;
