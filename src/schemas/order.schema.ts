import { z } from 'zod';

const recordId = z.string().trim().min(1).max(128);

export const merchantOrderParamsSchema = z.object({ merchantId: recordId, merchantOrderId: recordId }).strict();
export const merchantOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'ACCEPTED', 'PROCESSING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED', 'CANCELLED']).optional(),
}).strict();

export const checkoutSchema = z.object({
  addressId: recordId,
  paymentMethod: z.literal('BANK_TRANSFER'),
}).strict();

export const customerOrderParamsSchema = z.object({ orderId: recordId }).strict();
export const customerOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED']).optional(),
}).strict();

export type CustomerOrderQuery = z.infer<typeof customerOrderQuerySchema>;

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type MerchantOrderParams = z.infer<typeof merchantOrderParamsSchema>;
export type MerchantOrderQuery = z.infer<typeof merchantOrderQuerySchema>;
