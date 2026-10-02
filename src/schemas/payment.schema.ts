import { z } from 'zod';

const recordId = z.string().trim().min(1).max(128);

export const paymentParamsSchema = z.object({ paymentId: recordId }).strict();
export const paymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
}).strict();
export const rejectPaymentSchema = z.object({
  note: z.string().trim().min(1).max(500).optional(),
}).strict();

export type PaymentParams = z.infer<typeof paymentParamsSchema>;
export type PaymentQuery = z.infer<typeof paymentQuerySchema>;
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;
