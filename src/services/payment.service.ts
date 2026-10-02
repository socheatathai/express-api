import { readFile, unlink } from 'node:fs/promises';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { serializableTransaction } from '../lib/transaction.js';
import type { PaymentQuery, RejectPaymentInput } from '../schemas/payment.schema.js';
import { HttpError } from '../utils/http-error.js';
import { paymentTimeoutMinutes } from './order-expiry.service.js';
import { cancelUnshippedOrders, lockOrder } from './order-state.service.js';

export function publicPayment<T extends { proofStoragePath: string | null }>(payment: T) {
  const { proofStoragePath: _storagePath, ...visible } = payment;
  return visible;
}

export async function submitProof(userId: string, paymentId: string, file: Express.Multer.File | undefined) {
  if (!file) throw new HttpError(400, 'Payment proof image is required');
  await validateProofImage(file);
  const result = await serializableTransaction(async (transaction) => {
    const owned = await transaction.payment.findFirst({ where: { id: paymentId, order: { userId } } });
    if (!owned) throw new HttpError(404, 'Payment not found');
    const order = await lockOrder(transaction, owned.orderId);
    const payment = order.payment!;
    if (payment.method !== 'BANK_TRANSFER') throw new HttpError(409, 'Payment proof is only available for bank transfer');
    if (order.status !== 'PENDING' || !['PENDING', 'PROCESSING'].includes(payment.status)) {
      throw new HttpError(409, 'This payment no longer accepts proof uploads');
    }
    if (payment.status === 'PENDING' && order.createdAt.getTime() + paymentTimeoutMinutes() * 60000 <= Date.now()) throw new HttpError(409, 'Payment deadline has expired');
    const updated = await transaction.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PROCESSING', proofImageUrl: `/api/v1/payments/${paymentId}/proof`,
        proofStoragePath: file.path, proofSubmittedAt: new Date(), reviewedAt: null, reviewedBy: null, reviewNote: null,
      },
    });
    return { updated, previousPath: payment.proofStoragePath };
  });
  if (result.previousPath && result.previousPath !== file.path) await unlink(result.previousPath).catch(() => undefined);
  return publicPayment(result.updated);
}

export async function getProofPath(userId: string, paymentId: string) {
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  if (!actor || actor.status !== 'ACTIVE') throw new HttpError(401, 'Account is unavailable');
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, ...(actor.role === 'ADMIN' ? {} : { order: { userId } }) },
    select: { proofStoragePath: true },
  });
  if (!payment?.proofStoragePath) throw new HttpError(404, 'Payment proof not found');
  return payment.proofStoragePath;
}

export async function listPayments(query: PaymentQuery) {
  const where: Prisma.PaymentWhereInput = { method: 'BANK_TRANSFER', ...(query.status ? { status: query.status } : {}) };
  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where, skip: (query.page - 1) * query.limit, take: query.limit,
      orderBy: [{ proofSubmittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
      include: { order: { select: { id: true, user: { select: { id: true, name: true, phone: true } } } } },
    }),
    prisma.payment.count({ where }),
  ]);
  return { payments: payments.map(publicPayment), total, page: query.page, limit: query.limit };
}

async function reviewablePayment(transaction: Prisma.TransactionClient, adminUserId: string, paymentId: string) {
  const admin = await transaction.user.findUnique({ where: { id: adminUserId }, select: { role: true, status: true } });
  if (admin?.role !== 'ADMIN' || admin.status !== 'ACTIVE') throw new HttpError(403, 'Admin access is required');
  const payment = await transaction.payment.findUnique({ where: { id: paymentId }, select: { orderId: true } });
  if (!payment) throw new HttpError(404, 'Payment not found');
  const order = await lockOrder(transaction, payment.orderId);
  return { order, payment: order.payment! };
}

export async function verifyPayment(adminUserId: string, paymentId: string) {
  return serializableTransaction(async (transaction) => {
    const { order, payment } = await reviewablePayment(transaction, adminUserId, paymentId);
    const cancelledPortions = await transaction.merchantOrder.count({ where: { orderId: order.id, status: 'CANCELLED' } });
    if (payment.status === 'PAID') return { ...publicPayment(payment), refundRequired: cancelledPortions > 0 };
    if (payment.method !== 'BANK_TRANSFER' || payment.status !== 'PROCESSING' || !payment.proofStoragePath || order.status !== 'PENDING') {
      throw new HttpError(409, 'Only submitted proofs for pending orders can be verified');
    }
    const updated = await transaction.payment.update({ where: { id: paymentId }, data: {
      status: 'PAID', paidAt: new Date(), reviewedAt: new Date(), reviewedBy: adminUserId, reviewNote: null,
    } });
    await transaction.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
    return { ...publicPayment(updated), refundRequired: cancelledPortions > 0 };
  });
}

export async function rejectPayment(adminUserId: string, paymentId: string, input: RejectPaymentInput) {
  return serializableTransaction(async (transaction) => {
    const { order, payment } = await reviewablePayment(transaction, adminUserId, paymentId);
    if (payment.status === 'FAILED') return publicPayment(payment);
    if (payment.status !== 'PROCESSING' || order.status !== 'PENDING') throw new HttpError(409, 'Only submitted proofs for pending orders can be rejected');
    await cancelUnshippedOrders(transaction, order.id);
    return publicPayment(await transaction.payment.update({ where: { id: paymentId }, data: {
      status: 'FAILED', reviewedAt: new Date(), reviewedBy: adminUserId, reviewNote: input.note ?? null,
    } }));
  });
}

export async function removeUploadedFile(file: Express.Multer.File | undefined) {
  if (file) await unlink(file.path).catch(() => undefined);
}

async function validateProofImage(file: Express.Multer.File) {
  const bytes = await readFile(file.path);
  const png = bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND';
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
  const webp = bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.readUInt32LE(4) + 8 === bytes.length
    && bytes.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16));
  if (!(file.mimetype === 'image/png' && png || file.mimetype === 'image/jpeg' && jpeg || file.mimetype === 'image/webp' && webp)) {
    throw new HttpError(400, 'Payment proof contents do not match a supported image format');
  }
}
