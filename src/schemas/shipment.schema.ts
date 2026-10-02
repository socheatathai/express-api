import { z } from 'zod';

const recordId = z.string().trim().min(1).max(128);
const shipmentStatus = z.enum(['PENDING', 'READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED']);

export const shipmentParamsSchema = z.object({ merchantId: recordId, merchantOrderId: recordId }).strict();
export const createShipmentSchema = z.object({
  courierName: z.string().trim().min(1).max(150).optional(),
  trackingNumber: z.string().trim().min(1).max(150).optional(),
}).strict();
export const updateShipmentSchema = z.object({
  courierName: z.string().trim().min(1).max(150).optional(),
  trackingNumber: z.string().trim().min(1).max(150).optional(),
  status: shipmentStatus.optional(),
}).strict().refine((shipment) => Object.keys(shipment).length > 0, { message: 'Provide shipment fields to update' });

export type ShipmentParams = z.infer<typeof shipmentParamsSchema>;
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;