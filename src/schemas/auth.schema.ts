import { z } from 'zod';

const phoneSchema = z.string()
  .trim()
  .min(8)
  .max(20)
  .regex(/^\+?[0-9][0-9 ()-]*[0-9]$/, 'Enter a valid phone number');

const passwordSchema = z.string()
  .min(12, 'Password must contain at least 12 characters')
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
    message: 'Password must be 72 bytes or fewer',
  });

const loginPasswordSchema = z.string()
  .min(1)
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
    message: 'Password must be 72 bytes or fewer',
  });

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  email: z.string().trim().email().toLowerCase().optional(),
  password: passwordSchema,
}).strict();

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: loginPasswordSchema,
}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;