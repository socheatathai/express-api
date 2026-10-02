import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import type { CheckoutInput, CustomerOrderQuery } from '../schemas/order.schema.js';
import { serializableTransaction } from '../lib/transaction.js';
import { publicPayment } from './payment.service.js';
import { HttpError } from '../utils/http-error.js';

const cartForCheckout = {
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      variant: {
        include: {
          product: { select: { id: true, name: true, status: true, merchantId: true, merchant: { select: { status: true } } } },
          inventory: true,
        },
      },
    },
  },
};

export async function checkout(userId: string, input: CheckoutInput) {
  if (input.paymentMethod !== 'BANK_TRANSFER') throw new HttpError(400, 'Only BANK_TRANSFER is currently available');
  return checkoutTransaction(userId, input);
}

const customerOrderInclude = {
  payment: true,
  merchantOrders: { include: { items: true, shipment: true, merchant: { select: { id: true, name: true, slug: true } } } },
};

function visibleCustomerOrder<T extends { payment: { status: string; proofStoragePath: string | null } | null; merchantOrders: Array<{ status: string }> }>(order: T) {
  return { ...order, payment: order.payment ? publicPayment(order.payment) : null, refundRequired: order.payment?.status === 'PAID' && order.merchantOrders.some((child) => child.status === 'CANCELLED') };
}

export async function listCustomerOrders(userId: string, query: CustomerOrderQuery) {
  const where = { userId, ...(query.status ? { status: query.status } : {}) };
  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: customerOrderInclude }),
    prisma.order.count({ where }),
  ]);
  return { orders: orders.map(visibleCustomerOrder), total, page: query.page, limit: query.limit };
}

export async function getCustomerOrder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: customerOrderInclude });
  if (!order) throw new HttpError(404, 'Order not found');
  return visibleCustomerOrder(order);
}

async function checkoutTransaction(userId: string, input: CheckoutInput) {
  return serializableTransaction(async (transaction) => {
    const address = await transaction.address.findFirst({ where: { id: input.addressId, userId } });
    const cart = await transaction.cart.findUnique({ where: { userId }, include: cartForCheckout });

    if (!address) throw new HttpError(404, 'Address not found');
    if (!cart || cart.items.length === 0) throw new HttpError(409, 'Cart is empty');

    const groups = new Map<string, {
      subtotal: Prisma.Decimal;
      items: Array<{
        productId: string;
        variantId: string;
        productName: string;
        variantName: string;
        sku: string;
        unitPrice: Prisma.Decimal;
        quantity: number;
        subtotal: Prisma.Decimal;
      }>;
    }>();
    let subtotal = new Prisma.Decimal(0);

    for (const item of cart.items) {
      const product = item.variant.product;
      const inventory = item.variant.inventory;
      if (item.variant.status !== 'ACTIVE' || product.status !== 'ACTIVE' || product.merchant.status !== 'ACTIVE') {
        throw new HttpError(409, 'Cart contains a product that is no longer available');
      }
      if (!inventory) throw new HttpError(409, 'Cart contains a variant without inventory');
      if (inventory.quantity - inventory.reservedQuantity < item.quantity) {
        throw new HttpError(409, `Insufficient stock for ${item.variant.name}`);
      }

      const lineSubtotal = item.variant.price.mul(item.quantity);
      subtotal = subtotal.add(lineSubtotal);
      const group = groups.get(product.merchantId) ?? { subtotal: new Prisma.Decimal(0), items: [] };
      group.subtotal = group.subtotal.add(lineSubtotal);
      group.items.push({
        productId: product.id,
        variantId: item.variant.id,
        productName: product.name,
        variantName: item.variant.name,
        sku: item.variant.sku,
        unitPrice: item.variant.price,
        quantity: item.quantity,
        subtotal: lineSubtotal,
      });
      groups.set(product.merchantId, group);
    }

    if (subtotal.greaterThan('9999999999.99')) throw new HttpError(400, 'Order total exceeds the supported amount');

    for (const item of [...cart.items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      const reserved = await transaction.$executeRaw(Prisma.sql`
        UPDATE "Inventory"
        SET "reservedQuantity" = "reservedQuantity" + ${item.quantity}, "updatedAt" = NOW()
        WHERE "variantId" = ${item.variantId}
          AND "reservedQuantity" + ${item.quantity} <= "quantity"
      `);
      if (reserved !== 1) throw new HttpError(409, 'Inventory changed; please retry checkout');
    }

    const shippingAddress = JSON.stringify({
      recipientName: address.recipientName,
      phone: address.phone,
      province: address.province,
      district: address.district,
      commune: address.commune,
      village: address.village,
      addressLine: address.addressLine,
      landmark: address.landmark,
    });
    const shippingFee = new Prisma.Decimal(0);
    const discount = new Prisma.Decimal(0);
    const order = await transaction.order.create({
      data: {
        userId,
        status: 'PENDING',
        subtotal,
        shippingFee,
        discount,
        total: subtotal.add(shippingFee).sub(discount),
        recipientName: address.recipientName,
        recipientPhone: address.phone,
        shippingAddress,
        merchantOrders: {
          create: Array.from(groups.entries()).map(([merchantId, group]) => ({
            merchantId,
            status: 'PENDING',
            subtotal: group.subtotal,
            shippingFee,
            total: group.subtotal,
            items: { create: group.items },
          })),
        },
        payment: {
          create: {
            method: input.paymentMethod,
            status: 'PENDING',
            amount: subtotal.add(shippingFee).sub(discount),
          },
        },
      },
      include: { merchantOrders: { include: { items: true, merchant: { select: { id: true, name: true } } } }, payment: true },
    });

    await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });
    return visibleCustomerOrder(order);
  });
}
