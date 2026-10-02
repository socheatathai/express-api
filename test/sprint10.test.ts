import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getTokenSecret } from '../src/services/auth.service.js';

test('Sprint 10 tracks shipments and completes the parent after all deliveries', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let categoryId = '';
  let orderId = '';

  try {
    const customer = await prisma.user.create({ data: { name: 'Shipment Customer', phone: `ship-customer-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash' } });
    const ownerOne = await prisma.user.create({ data: { name: 'Shipment Owner One', phone: `ship-one-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash' } });
    const ownerTwo = await prisma.user.create({ data: { name: 'Shipment Owner Two', phone: `ship-two-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash' } });
    const outsider = await prisma.user.create({ data: { name: 'Shipment Outsider', phone: `ship-out-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash' } });
    userIds.push(customer.id, ownerOne.id, ownerTwo.id, outsider.id);
    async function token(userId: string) {
      return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuer('gz-buy-api').setAudience('gz-buy-client').setExpirationTime('1h').sign(getTokenSecret());
    }
    const ownerOneToken = await token(ownerOne.id);
    const ownerTwoToken = await token(ownerTwo.id);
    const outsiderToken = await token(outsider.id);
    const merchantOne = await prisma.merchant.create({ data: { name: `Shipment Store One ${suffix}`, slug: `shipment-store-one-${suffix}`, phone: `+855${suffix}`, status: 'ACTIVE', members: { create: { userId: ownerOne.id, role: 'OWNER' } } } });
    const merchantTwo = await prisma.merchant.create({ data: { name: `Shipment Store Two ${suffix}`, slug: `shipment-store-two-${suffix}`, phone: `+855${suffix}1`, status: 'ACTIVE', members: { create: { userId: ownerTwo.id, role: 'OWNER' } } } });
    merchantIds.push(merchantOne.id, merchantTwo.id);
    const category = await prisma.category.create({ data: { name: `Shipment Category ${suffix}`, slug: `shipment-category-${suffix}` } });
    categoryId = category.id;
    async function product(merchantId: string, sku: string) {
      return prisma.product.create({ data: { merchantId, categoryId, name: `Shipment Product ${sku}`, slug: `shipment-product-${sku}-${suffix}`, description: 'Shipment test product', status: 'ACTIVE', variants: { create: { name: 'Default', sku: `${sku}-${suffix}`, price: '10.00', inventory: { create: { quantity: 5, reservedQuantity: 1 } } } } }, include: { variants: true } });
    }
    const productOne = await product(merchantOne.id, 'ONE');
    const productTwo = await product(merchantTwo.id, 'TWO');
    const order = await prisma.order.create({
      data: {
        userId: customer.id,
        status: 'PROCESSING',
        subtotal: '20.00',
        total: '20.00',
        recipientName: 'Shipment Customer',
        recipientPhone: '+85512345678',
        shippingAddress: '{"addressLine":"Shipment Street"}',
        merchantOrders: {
          create: [
            { merchantId: merchantOne.id, status: 'READY_FOR_PICKUP', subtotal: '10.00', total: '10.00', items: { create: { productId: productOne.id, variantId: productOne.variants[0].id, productName: productOne.name, variantName: 'Default', sku: `ONE-${suffix}`, unitPrice: '10.00', quantity: 1, subtotal: '10.00' } } },
            { merchantId: merchantTwo.id, status: 'READY_FOR_PICKUP', subtotal: '10.00', total: '10.00', items: { create: { productId: productTwo.id, variantId: productTwo.variants[0].id, productName: productTwo.name, variantName: 'Default', sku: `TWO-${suffix}`, unitPrice: '10.00', quantity: 1, subtotal: '10.00' } } },
          ],
        },
        payment: { create: { method: 'BANK_TRANSFER', status: 'PAID', amount: '20.00', paidAt: new Date() } },
      },
      include: { merchantOrders: true },
    });
    orderId = order.id;
    const orderOneId = order.merchantOrders.find((item) => item.merchantId === merchantOne.id)!.id;
    const orderTwoId = order.merchantOrders.find((item) => item.merchantId === merchantTwo.id)!.id;
    const baseOne = `/api/v1/seller/stores/${merchantOne.id}/orders/${orderOneId}/shipment`;
    const baseTwo = `/api/v1/seller/stores/${merchantTwo.id}/orders/${orderTwoId}/shipment`;
    const call = (method: 'get' | 'post' | 'patch', path: string, token: string) => request(app)[method](path).set('Authorization', `Bearer ${token}`);

    assert.equal((await call('post', baseOne, ownerOneToken).send({ courierName: 'Courier One', trackingNumber: 'TRACK-ONE' })).status, 201);
    assert.equal((await call('post', baseTwo, ownerTwoToken).send({ trackingNumber: 'TRACK-TWO' })).status, 201);
    assert.equal((await call('get', baseTwo, outsiderToken)).status, 404);
    assert.equal((await call('patch', baseOne, ownerOneToken).send({ status: 'DELIVERED' })).status, 409);
    for (const status of ['READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      const updated = await call('patch', baseOne, ownerOneToken).send({ status });
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
    }
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'PROCESSING');
    for (const status of ['READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      const updated = await call('patch', baseTwo, ownerTwoToken).send({ status });
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
    }
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'COMPLETED');
  } finally {
    if (orderId) await prisma.order.delete({ where: { id: orderId } });
    if (merchantIds.length) await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});
