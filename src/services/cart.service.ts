import { serializableTransaction } from '../lib/transaction.js';
import { prisma } from '../lib/prisma.js';
import type { AddCartItemInput, UpdateCartItemInput } from '../schemas/cart.schema.js';
import { HttpError } from '../utils/http-error.js';

const cartInclude = {
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      variant: {
        include: {
          product: { select: { id: true, name: true, slug: true, status: true, merchantId: true } },
          inventory: true,
        },
      },
    },
  },
};

async function getOrCreateCart(userId: string, transaction = prisma) {
  return transaction.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    include: cartInclude,
  });
}

export async function getCart(userId: string) {
  return getOrCreateCart(userId);
}

export async function addCartItem(userId: string, input: AddCartItemInput) {
  return addCartItemTransaction(userId, input);
}

async function addCartItemTransaction(userId: string, input: AddCartItemInput) {
  return serializableTransaction(async (transaction) => {
    const variant = await transaction.productVariant.findFirst({
      where: {
        id: input.variantId,
        status: 'ACTIVE',
        product: { status: 'ACTIVE', merchant: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!variant) throw new HttpError(404, 'Sellable product variant not found');

    const cart = await transaction.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    const existing = await transaction.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } } });
    if ((existing?.quantity ?? 0) + input.quantity > 100000) throw new HttpError(400, 'Cart item quantity cannot exceed 100000');
    await transaction.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
      create: { cartId: cart.id, variantId: input.variantId, quantity: input.quantity },
      update: { quantity: { increment: input.quantity } },
    });
    return transaction.cart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude });
  });
}

export async function updateCartItem(userId: string, itemId: string, input: UpdateCartItemInput) {
  const result = await prisma.cartItem.updateMany({
    where: { id: itemId, cart: { userId } },
    data: { quantity: input.quantity },
  });
  if (result.count === 0) throw new HttpError(404, 'Cart item not found');
  return getCart(userId);
}

export async function removeCartItem(userId: string, itemId: string) {
  const result = await prisma.cartItem.deleteMany({ where: { id: itemId, cart: { userId } } });
  if (result.count === 0) throw new HttpError(404, 'Cart item not found');
}
