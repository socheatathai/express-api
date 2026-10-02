import { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../utils/http-error.js';

export const cancellableMerchantStatuses = ['PENDING', 'ACCEPTED', 'PROCESSING', 'READY_FOR_PICKUP'] as const;

/** Every payment, fulfillment, and cancellation mutation locks the parent first. */
export async function lockOrder(transaction: Prisma.TransactionClient, orderId: string) {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `);
  if (!rows.length) throw new HttpError(404, 'Order not found');
  // Touch the parent even when its status stays unchanged. Waiting serializable
  // transactions must retry rather than read children from a pre-lock snapshot.
  return transaction.order.update({ where: { id: orderId }, data: { updatedAt: new Date() }, include: { payment: true } });
}

export function requirePaidOrder(order: { status: string; payment: { status: string } | null }) {
  if (!['CONFIRMED', 'PROCESSING'].includes(order.status) || order.payment?.status !== 'PAID') {
    throw new HttpError(409, 'A paid, active order is required for fulfillment');
  }
}

export async function releaseReservations(transaction: Prisma.TransactionClient, items: Array<{ variantId: string; quantity: number }>) {
  // Use a stable inventory lock order across multi-store orders.
  const quantities = new Map<string, number>();
  for (const item of items) quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  for (const [variantId, quantity] of [...quantities].sort(([a], [b]) => a.localeCompare(b))) {
    const changed = await transaction.$executeRaw(Prisma.sql`
      UPDATE "Inventory" SET "reservedQuantity" = "reservedQuantity" - ${quantity}, "updatedAt" = NOW()
      WHERE "variantId" = ${variantId} AND "reservedQuantity" >= ${quantity}
    `);
    if (changed !== 1) throw new HttpError(409, 'Inventory reservations are inconsistent; cancellation was rolled back');
  }
}

export async function cancelUnshippedOrders(transaction: Prisma.TransactionClient, orderId: string) {
  const children = await transaction.merchantOrder.findMany({ where: { orderId }, include: { items: true } });
  const active = children.filter((child) => child.status !== 'CANCELLED');
  if (active.some((child) => !cancellableMerchantStatuses.some((status) => status === child.status))) {
    throw new HttpError(409, 'An order with shipped items cannot be cancelled');
  }
  await releaseReservations(transaction, active.flatMap((child) => child.items));
  await transaction.merchantOrder.updateMany({ where: { orderId, status: { in: [...cancellableMerchantStatuses] } }, data: { status: 'CANCELLED' } });
  await transaction.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
}

/** Caller holds the parent lock. Cancelled children require no further delivery. */
export async function reconcileOrder(transaction: Prisma.TransactionClient, orderId: string) {
  const children = await transaction.merchantOrder.findMany({ where: { orderId }, select: { status: true } });
  const remaining = children.filter((child) => child.status !== 'CANCELLED');
  if (!remaining.length) {
    await transaction.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
    await transaction.payment.updateMany({ where: { orderId, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'FAILED', reviewNote: 'Order cancelled' } });
  } else if (remaining.every((child) => child.status === 'DELIVERED')) {
    await transaction.order.update({ where: { id: orderId }, data: { status: 'COMPLETED' } });
  } else if (remaining.some((child) => ['PROCESSING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED'].includes(child.status))) {
    await transaction.order.updateMany({ where: { id: orderId, status: 'CONFIRMED' }, data: { status: 'PROCESSING' } });
  }
}
