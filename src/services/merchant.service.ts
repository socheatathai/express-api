import { Prisma } from '../generated/prisma/client.js';
import type { MerchantRole, MerchantStatus } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../utils/http-error.js';
import type { CreateMerchantInput, SellerQuery } from '../schemas/merchant.schema.js';

export async function createMerchant(userId: string, input: CreateMerchantInput) {
  return prisma.merchant.create({ data: { ...input, status: 'PENDING', members: { create: { userId, role: 'OWNER' } } } });
}
export async function listOwnedMerchants(userId: string) {
  return prisma.merchant.findMany({ where: { members: { some: { userId } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
}
async function authorize(transaction: Prisma.TransactionClient, userId: string, merchantId: string, ownerOnly = false) {
  const membership = await transaction.merchantMember.findUnique({ where: { merchantId_userId: { merchantId, userId } }, include: { merchant: true } });
  if (!membership) throw new HttpError(404, 'Seller not found');
  if (ownerOnly && membership.role !== 'OWNER') throw new HttpError(403, 'Owner access is required');
  return membership;
}
export async function getOwnedMerchant(userId: string, merchantId: string) {
  return (await authorize(prisma, userId, merchantId)).merchant;
}
export async function listMembers(userId: string, merchantId: string) {
  await authorize(prisma, userId, merchantId);
  return prisma.merchantMember.findMany({ where: { merchantId }, select: { id: true, userId: true, role: true, createdAt: true }, orderBy: { id: 'asc' } });
}
export async function manageMember(actorId: string, merchantId: string, userId: string, action: 'add' | 'update' | 'delete', role?: Exclude<MerchantRole, 'OWNER'>) {
  return prisma.$transaction(async (tx) => {
    const actor = await authorize(tx, actorId, merchantId, true);
    if (actor.merchant.status !== 'ACTIVE') throw new HttpError(409, 'Seller must be active to manage members');
    const existing = await tx.merchantMember.findUnique({ where: { merchantId_userId: { merchantId, userId } } });
    if (existing?.role === 'OWNER') throw new HttpError(403, 'Owner membership cannot be changed');
    if (action === 'add') {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user || user.status !== 'ACTIVE') throw new HttpError(404, 'Active user not found');
      return tx.merchantMember.create({ data: { merchantId, userId, role: role! } });
    }
    if (!existing) throw new HttpError(404, 'Member not found');
    if (action === 'delete') return tx.merchantMember.delete({ where: { id: existing.id } });
    return tx.merchantMember.update({ where: { id: existing.id }, data: { role } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
export async function listSellers(query: SellerQuery) {
  const where = query.status ? { status: query.status } : {};
  const [sellers, total] = await prisma.$transaction([
    prisma.merchant.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }),
    prisma.merchant.count({ where }),
  ]);
  return { sellers, total, page: query.page, limit: query.limit };
}
export async function getSeller(merchantId: string) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new HttpError(404, 'Seller not found');
  return merchant;
}
export async function transitionSeller(merchantId: string, action: 'approve' | 'reject' | 'suspend') {
  const target: MerchantStatus = action === 'approve' ? 'ACTIVE' : action === 'reject' ? 'REJECTED' : 'SUSPENDED';
  const from: MerchantStatus[] = action === 'approve' ? ['PENDING', 'SUSPENDED'] : action === 'reject' ? ['PENDING'] : ['ACTIVE'];
  return prisma.$transaction(async (tx) => {
    const result = await tx.merchant.updateMany({ where: { id: merchantId, status: { in: from } }, data: { status: target } });
    if (!result.count) {
      if (!(await tx.merchant.findUnique({ where: { id: merchantId } }))) throw new HttpError(404, 'Seller not found');
      throw new HttpError(409, 'Invalid seller status transition');
    }
    return tx.merchant.findUniqueOrThrow({ where: { id: merchantId } });
  });
}
