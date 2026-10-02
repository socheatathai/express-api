import { z } from 'zod';

const recordId = z.string().trim().min(1).max(128);

export const cartItemParamsSchema = z.object({ itemId: recordId }).strict();

export const addCartItemSchema = z.object({
  variantId: recordId,
  quantity: z.number().int().min(1).max(100000),
}).strict();

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(100000),
}).strict();

export type CartItemParams = z.infer<typeof cartItemParamsSchema>;
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
