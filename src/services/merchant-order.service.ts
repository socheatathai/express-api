import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import type { MerchantOrderQuery } from '../schemas/order.schema.js';
import { serializableTransaction } from '../lib/transaction.js';
import { cancellableMerchantStatuses, lockOrder, reconcileOrder, releaseReservations, requirePaidOrder } from './order-state.service.js';
import { publicPayment } from './payment.service.js';
import { HttpError } from '../utils/http-error.js';

const merchantOrderInclude = {
  merchant: { select: { id: true, name: true, slug: true } },
  order: { select: { id: true, status: true, user: { select: { id: true, name: true, phone: true } }, payment: true } },
  items: true,
};

type MerchantMemberClient = Pick<Prisma.TransactionClient, 'merchantMember'>;

export async function requireMerchantMember(userId: string, merchantId: string, transaction: MerchantMemberClient = prisma) {
  const membership = await transaction.merchantMember.findUnique({
    where: { merchantId_userId: { merchantId, userId } },
    include: { merchant: { select: { status: true } } },
  });
  if (!membership) throw new HttpError(404, 'Seller not found');
  if (membership.merchant.status !== 'ACTIVE') throw new HttpError(409, 'Seller must be active to manage orders');
}

export async function listMerchantOrders(userId: string, merchantId: string, query: MerchantOrderQuery) {
  await requireMerchantMember(userId, merchantId);
  const where = { merchantId, ...(query.status ? { status: query.status } : {}) } satisfies Prisma.MerchantOrderWhereInput;
  const [orders, total] = await prisma.$transaction([
    prisma.merchantOrder.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: merchantOrderInclude }),
    prisma.merchantOrder.count({ where }),
  ]);
  return { orders: orders.map(visibleMerchantOrder), total, page: query.page, limit: query.limit };
}

export async function getMerchantOrder(userId: string, merchantId: string, merchantOrderId: string) {
  await requireMerchantMember(userId, merchantId);
  const order = await prisma.merchantOrder.findFirst({ where: { id: merchantOrderId, merchantId }, include: merchantOrderInclude });
  if (!order) throw new HttpError(404, 'Merchant order not found');
  return visibleMerchantOrder(order);
}

function visibleMerchantOrder<T extends { order: { payment: { proofStoragePath: string | null } | null } }>(value: T) {
  return { ...value, order: { ...value.order, payment: value.order.payment ? publicPayment(value.order.payment) : null } };
}

export async function transitionMerchantOrder(userId: string, merchantId: string, merchantOrderId: string, action: 'accept' | 'process' | 'ready') {
  return serializableTransaction(async (transaction) => {
    await requireMerchantMember(userId, merchantId, transaction);
    const child = await transaction.merchantOrder.findFirst({ where: { id: merchantOrderId, merchantId } });
    if (!child) throw new HttpError(404, 'Merchant order not found');
    const parent = await lockOrder(transaction, child.orderId);
    requirePaidOrder(parent);
    const transition = {
      accept: { from: 'PENDING' as const, to: 'ACCEPTED' as const },
      process: { from: 'ACCEPTED' as const, to: 'PROCESSING' as const },
      ready: { from: 'PROCESSING' as const, to: 'READY_FOR_PICKUP' as const },
    }[action];
    const changed = await transaction.merchantOrder.updateMany({ where: { id: merchantOrderId, merchantId, status: transition.from }, data: { status: transition.to } });
    if (!changed.count) throw new HttpError(409, `Only ${transition.from} merchant orders can advance`);
    await reconcileOrder(transaction, child.orderId);
    return visibleMerchantOrder(await transaction.merchantOrder.findUniqueOrThrow({ where: { id: merchantOrderId }, include: merchantOrderInclude }));
  });
}

export async function cancelMerchantOrder(userId: string, merchantId: string, merchantOrderId: string) {
  return serializableTransaction(async (transaction) => {
    await requireMerchantMember(userId, merchantId, transaction);
    const found = await transaction.merchantOrder.findFirst({ where: { id: merchantOrderId, merchantId }, select: { orderId: true } });
    if (!found) throw new HttpError(404, 'Merchant order not found');
    const parent = await lockOrder(transaction, found.orderId);
    const child = await transaction.merchantOrder.findUniqueOrThrow({ where: { id: merchantOrderId }, include: { items: true } });
    if (child.status === 'CANCELLED') return {
      merchantOrder: visibleMerchantOrder(await transaction.merchantOrder.findUniqueOrThrow({ where: { id: merchantOrderId }, include: merchantOrderInclude })),
      refundRequired: parent.payment?.status === 'PAID',
    };
    if (!cancellableMerchantStatuses.some((status) => status === child.status) || ['CANCELLED', 'COMPLETED'].includes(parent.status)) {
      throw new HttpError(409, 'This merchant order cannot be cancelled in its current status');
    }
    await releaseReservations(transaction, child.items);
    await transaction.merchantOrder.update({ where: { id: merchantOrderId }, data: { status: 'CANCELLED' } });
    await reconcileOrder(transaction, found.orderId);
    // Original charge/snapshots are retained; any cancelled portion requires a refund if paid.
    return {
      merchantOrder: visibleMerchantOrder(await transaction.merchantOrder.findUniqueOrThrow({ where: { id: merchantOrderId }, include: merchantOrderInclude })),
      refundRequired: parent.payment?.status === 'PAID',
    };
  });
}
