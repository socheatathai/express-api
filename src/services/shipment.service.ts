import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import type { CreateShipmentInput, UpdateShipmentInput } from '../schemas/shipment.schema.js';
import { requireMerchantMember } from './merchant-order.service.js';
import { serializableTransaction } from '../lib/transaction.js';
import { lockOrder, reconcileOrder, requirePaidOrder } from './order-state.service.js';
import { HttpError } from '../utils/http-error.js';

const shipmentInclude = {
  merchantOrder: { select: { id: true, merchantId: true, orderId: true, status: true } },
};

const transitions: Record<string, string[]> = {
  PENDING: ['READY_FOR_PICKUP'],
  READY_FOR_PICKUP: ['PICKED_UP'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'FAILED', 'RETURNED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED', 'RETURNED'],
};

type ShipmentClient = Pick<Prisma.TransactionClient, 'merchantMember' | 'shipment'>;

async function findOwnedShipment(userId: string, merchantId: string, merchantOrderId: string, transaction: ShipmentClient = prisma) {
  await requireMerchantMember(userId, merchantId, transaction);
  const shipment = await transaction.shipment.findUnique({ where: { merchantOrderId }, include: shipmentInclude });
  if (!shipment || shipment.merchantOrder.merchantId !== merchantId) throw new HttpError(404, 'Shipment not found');
  return shipment;
}

export async function getShipment(userId: string, merchantId: string, merchantOrderId: string) {
  return findOwnedShipment(userId, merchantId, merchantOrderId);
}

export async function createShipment(userId: string, merchantId: string, merchantOrderId: string, input: CreateShipmentInput) {
  return serializableTransaction(async (transaction) => {
    await requireMerchantMember(userId, merchantId, transaction);
    const child = await transaction.merchantOrder.findFirst({ where: { id: merchantOrderId, merchantId } });
    if (!child) throw new HttpError(404, 'Merchant order not found');
    requirePaidOrder(await lockOrder(transaction, child.orderId));
    if (child.status !== 'READY_FOR_PICKUP') throw new HttpError(409, 'Merchant order must be ready before shipment creation');
    if (await transaction.shipment.findUnique({ where: { merchantOrderId } })) throw new HttpError(409, 'Shipment already exists');
    return transaction.shipment.create({ data: { ...input, merchantOrderId }, include: shipmentInclude });
  });
}

export async function updateShipment(userId: string, merchantId: string, merchantOrderId: string, input: UpdateShipmentInput) {
  return serializableTransaction(async (transaction) => {
    const owned = await findOwnedShipment(userId, merchantId, merchantOrderId, transaction);
    const parent = await lockOrder(transaction, owned.merchantOrder.orderId);
    const shipment = await transaction.shipment.findUniqueOrThrow({ where: { id: owned.id }, include: shipmentInclude });
    if (shipment.merchantOrder.status === 'CANCELLED' || parent.status === 'CANCELLED') {
      throw new HttpError(409, 'Cancelled shipments cannot be updated');
    }
    const advancing = input.status !== undefined && input.status !== shipment.status;
    if (advancing) {
      requirePaidOrder(parent);
      if (!transitions[shipment.status]?.includes(input.status!)) throw new HttpError(409, `Shipment cannot move from ${shipment.status} to ${input.status}`);
      const expectedChildStatus = ['PENDING', 'READY_FOR_PICKUP'].includes(shipment.status) ? 'READY_FOR_PICKUP' : 'SHIPPED';
      if (shipment.merchantOrder.status !== expectedChildStatus) throw new HttpError(409, 'Shipment and merchant order states are inconsistent');
      if (input.status === 'PICKED_UP') {
        // Goods leave physical stock at pickup. Repeated same-state requests do not consume again.
        const items = await transaction.orderItem.findMany({ where: { merchantOrderId }, orderBy: { variantId: 'asc' } });
        for (const item of items) {
          const changed = await transaction.$executeRaw(Prisma.sql`
            UPDATE "Inventory"
            SET "quantity" = "quantity" - ${item.quantity}, "reservedQuantity" = "reservedQuantity" - ${item.quantity}, "updatedAt" = NOW()
            WHERE "variantId" = ${item.variantId} AND "reservedQuantity" >= ${item.quantity} AND "quantity" >= ${item.quantity}
          `);
          if (changed !== 1) throw new HttpError(409, 'Inventory reservations are inconsistent; pickup was rolled back');
        }
      }
      if (input.status === 'READY_FOR_PICKUP') await transaction.merchantOrder.update({ where: { id: merchantOrderId }, data: { status: 'READY_FOR_PICKUP' } });
      if (['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(input.status!)) await transaction.merchantOrder.update({ where: { id: merchantOrderId }, data: { status: 'SHIPPED' } });
      if (input.status === 'DELIVERED') await transaction.merchantOrder.update({ where: { id: merchantOrderId }, data: { status: 'DELIVERED' } });
      await reconcileOrder(transaction, parent.id);
    }
    return transaction.shipment.update({
      where: { id: shipment.id },
      data: { ...input, ...(advancing && input.status === 'PICKED_UP' ? { shippedAt: new Date() } : {}), ...(advancing && input.status === 'DELIVERED' ? { deliveredAt: new Date() } : {}) },
      include: shipmentInclude,
    });
  });
}
