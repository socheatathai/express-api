import { prisma } from '../lib/prisma.js';
import { serializableTransaction } from '../lib/transaction.js';
import { cancelUnshippedOrders, lockOrder } from './order-state.service.js';

export function paymentTimeoutMinutes(): number {
  const value = Number(process.env.ORDER_PAYMENT_TIMEOUT_MINUTES ?? 1440);
  if (!Number.isInteger(value) || value < 1 || value > 525600) throw new Error('ORDER_PAYMENT_TIMEOUT_MINUTES must be between 1 and 525600');
  return value;
}

/** Proofs awaiting human review do not expire; only abandoned checkouts do. */
export async function expireUnpaidOrders(now = new Date()) {
  const cutoff = new Date(now.getTime() - paymentTimeoutMinutes() * 60000);
  const candidates = await prisma.order.findMany({
    where: { status: 'PENDING', createdAt: { lte: cutoff }, payment: { status: 'PENDING' } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100, select: { id: true },
  });
  let expired = 0;
  for (const candidate of candidates) {
    expired += await serializableTransaction(async (transaction) => {
      const order = await lockOrder(transaction, candidate.id);
      if (order.status !== 'PENDING' || order.payment?.status !== 'PENDING' || order.createdAt > cutoff) return 0;
      await cancelUnshippedOrders(transaction, order.id);
      await transaction.payment.update({ where: { id: order.payment.id }, data: { status: 'FAILED', reviewNote: 'Payment deadline expired' } });
      return 1;
    });
  }
  return expired;
}
