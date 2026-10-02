import { z } from 'zod';
const id = z.string().trim().min(1).max(100);
export const merchantParams = z.object({ merchantId: id });
export const memberParams = z.object({ merchantId: id, userId: id });
export const createMerchantSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  phone: z.string().trim().min(8).max(20).regex(/^\+?[0-9][0-9 ()-]*[0-9]$/),
}).strict();
export const memberSchema = z.object({ userId: id, role: z.enum(['MANAGER', 'STAFF']) }).strict();
export const roleSchema = memberSchema.omit({ userId: true });
export const sellerQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED']).optional(),
}).strict();
export type CreateMerchantInput = z.infer<typeof createMerchantSchema>;
export type SellerQuery = z.infer<typeof sellerQuery>;
