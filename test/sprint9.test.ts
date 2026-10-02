import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getTokenSecret } from '../src/services/auth.service.js';

test('Sprint 9 enforces merchant fulfillment and releases cancelled reservations', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const userIds: string[] = [];
  let merchantId = '';
  let categoryId = '';
  let orderId = '';
  let variantId = '';

  try {
    const owner = await prisma.user.create({ data: { name: 'Fulfillment Owner', phone: `ful-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash' } });
    const customer = await prisma.user.create({ data: { name: 'Fulfillment Customer', phone: `ful-customer-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash' } });
    const outsider = await prisma.user.create({ data: { name: 'Fulfillment Outsider', phone: `ful-outsider-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash' } });
    userIds.push(owner.id, customer.id, outsider.id);
    async function token(userId: string) {
      return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuer('gz-buy-api').setAudience('gz-buy-client').setExpirationTime('1h').sign(getTokenSecret());
    }
    const ownerToken = await token(owner.id);
    const outsiderToken = await token(outsider.id);
    const merchant = await prisma.merchant.create({
      data: { name: `Fulfillment Store ${suffix}`, slug: `fulfillment-store-${suffix}`, phone: `+855${suffix}`, status: 'ACTIVE', members: { create: { userId: owner.id, role: 'OWNER' } } },
    });
    merchantId = merchant.id;
    const category = await prisma.category.create({ data: { name: `Fulfillment Category ${suffix}`, slug: `fulfillment-category-${suffix}` } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { merchantId, categoryId, name: 'Fulfillment Product', slug: `fulfillment-product-${suffix}`, description: 'Fulfillment test product', status: 'ACTIVE', variants: { create: { name: 'Default', sku: `FUL-${suffix}`, price: '10.00', inventory: { create: { quantity: 5, reservedQuantity: 2 } } } } },
      include: { variants: true },
    });
    variantId = product.variants[0].id;
    const order = await prisma.order.create({
      data: {
        userId: customer.id,
        status: 'CONFIRMED',
        subtotal: '20.00',
        total: '20.00',
        recipientName: 'Fulfillment Customer',
        recipientPhone: '+85512345678',
        shippingAddress: '{"addressLine":"Fulfillment Street"}',
        merchantOrders: { create: { merchantId, status: 'PENDING', subtotal: '20.00', total: '20.00', items: { create: { productId: product.id, variantId, productName: product.name, variantName: 'Default', sku: `FUL-${suffix}`, unitPrice: '10.00', quantity: 2, subtotal: '20.00' } } } },
        payment: { create: { method: 'BANK_TRANSFER', status: 'PAID', amount: '20.00', paidAt: new Date() } },
      },
      include: { merchantOrders: true },
    });
    orderId = order.id;
    const merchantOrderId = order.merchantOrders[0].id;
    const base = `/api/v1/seller/stores/${merchantId}/orders`;
    const ownerCall = (method: 'get' | 'post', path: string, token = ownerToken) => request(app)[method](path).set('Authorization', `Bearer ${token}`);

    assert.equal((await ownerCall('get', base, outsiderToken)).status, 404);
    assert.equal((await ownerCall('get', base)).body.orders.total, 1);
    assert.equal((await ownerCall('post', `${base}/${merchantOrderId}/accept`)).body.order.status, 'ACCEPTED');
    assert.equal((await ownerCall('post', `${base}/${merchantOrderId}/process`)).body.order.status, 'PROCESSING');
    assert.equal((await ownerCall('post', `${base}/${merchantOrderId}/ready`)).body.order.status, 'READY_FOR_PICKUP');
    const cancelled = await ownerCall('post', `${base}/${merchantOrderId}/cancel`);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.result.merchantOrder.status, 'CANCELLED');
    assert.equal(cancelled.body.result.refundRequired, true);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'CANCELLED');
    assert.equal((await prisma.inventory.findUniqueOrThrow({ where: { variantId } })).reservedQuantity, 0);
    assert.equal((await ownerCall('post', `${base}/${merchantOrderId}/accept`)).status, 409);
  } finally {
    if (orderId) await prisma.order.delete({ where: { id: orderId } });
    if (merchantId) await prisma.merchant.delete({ where: { id: merchantId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});
