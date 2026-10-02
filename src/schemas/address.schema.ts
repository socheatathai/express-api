import { z } from 'zod';

const phoneSchema = z.string()
  .trim()
  .min(8)
  .max(20)
  .regex(/^\+?[0-9][0-9 ()-]*[0-9]$/, 'Enter a valid phone number');

export const createAddressSchema = z.object({
  recipientName: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  province: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100),
  commune: z.string().trim().min(1).max(100),
  village: z.string().trim().max(100).optional(),
  addressLine: z.string().trim().min(1).max(255),
  landmark: z.string().trim().max(255).optional(),
  isDefault: z.boolean().optional(),
}).strict();

export const updateAddressSchema = createAddressSchema
  .partial()
  .strict()
  .refine((address) => Object.keys(address).length > 0, {
    message: 'Provide at least one address field to update',
  });

export const addressParamsSchema = z.object({
  addressId: z.string().trim().min(1).max(128),
}).strict();

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
export type AddressParams = z.infer<typeof addressParamsSchema>;