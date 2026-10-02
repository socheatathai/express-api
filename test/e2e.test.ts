import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getTokenSecret } from '../src/services/auth.service.js';

test('E2E completes registration through payment, fulfillment, and delivery', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  let customerId = '';
  let adminId = '';
  let merchantId = '';
  let categoryId = '';
  let orderId = '';
  let paymentId = '';
  let proofPath = '';

  try {
    const registered = await request(app).post('/api/v1/auth/register').send({ name: 'E2E Customer', phone: `+855${Date.now().toString().slice(-8)}`, password: 'E2E-Strong-Password-123' });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    customerId = registered.body.user.id;
    const customerToken = registered.body.accessToken as string;
    const address = await request(app).post('/api/v1/addresses').set('Authorization', `Bearer ${customerToken}`).send({ recipientName: 'E2E Customer', phone: '+85512345678', province: 'Phnom Penh', district: 'Daun Penh', commune: 'Srah Chak', addressLine: 'E2E Street' });
    assert.equal(address.status, 201);

    const admin = await prisma.user.create({ data: { name: 'E2E Admin', phone: `e2e-admin-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash', role: 'ADMIN' } });
    adminId = admin.id;
    const adminToken = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(admin.id).setIssuer('gz-buy-api').setAudience('gz-buy-client').setExpirationTime('1h').sign(getTokenSecret());
    const merchant = await prisma.merchant.create({ data: { name: `E2E Store ${suffix}`, slug: `e2e-store-${suffix}`, phone: `+855${suffix}`, status: 'ACTIVE', members: { create: { userId: customerId, role: 'OWNER' } } } });
    merchantId = merchant.id;
    const category = await prisma.category.create({ data: { name: `E2E Category ${suffix}`, slug: `e2e-category-${suffix}` } });
    categoryId = category.id;
    const product = await prisma.product.create({ data: { merchantId, categoryId, name: 'E2E Product', slug: `e2e-product-${suffix}`, description: 'E2E product', status: 'ACTIVE', variants: { create: { name: 'Default', sku: `E2E-${suffix}`, price: '15.00', inventory: { create: { quantity: 3 } } } } }, include: { variants: true } });

    assert.equal((await request(app).post('/api/v1/cart/items').set('Authorization', `Bearer ${customerToken}`).send({ variantId: product.variants[0].id, quantity: 1 })).status, 201);
    const checkout = await request(app).post('/api/v1/orders/checkout').set('Authorization', `Bearer ${customerToken}`).send({ addressId: address.body.address.id, paymentMethod: 'BANK_TRANSFER' });
    assert.equal(checkout.status, 201);
    orderId = checkout.body.order.id;
    paymentId = checkout.body.order.payment.id;
    const proof = await request(app).post(`/api/v1/payments/${paymentId}/proof`).set('Authorization', `Bearer ${customerToken}`).attach('proof', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfWQAAAAASUVORK5CYII=', 'base64'), { filename: 'proof.png', contentType: 'image/png' });
    assert.equal(proof.status, 201);
    proofPath = (await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).proofStoragePath ?? '';
    assert.equal((await request(app).post(`/api/v1/admin/payments/${paymentId}/verify`).set('Authorization', `Bearer ${adminToken}`).send({})).body.payment.status, 'PAID');

    const sellerBase = `/api/v1/seller/stores/${merchantId}/orders`;
    for (const action of ['accept', 'process', 'ready']) assert.equal((await request(app).post(`${sellerBase}/${checkout.body.order.merchantOrders[0].id}/${action}`).set('Authorization', `Bearer ${customerToken}`).send({})).status, 200);
    const merchantOrderId = checkout.body.order.merchantOrders[0].id;
    const shipmentPath = `${sellerBase}/${merchantOrderId}/shipment`;
    assert.equal((await request(app).post(shipmentPath).set('Authorization', `Bearer ${customerToken}`).send({ trackingNumber: 'E2E-TRACK' })).status, 201);
    for (const status of ['READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']) assert.equal((await request(app).patch(shipmentPath).set('Authorization', `Bearer ${customerToken}`).send({ status })).status, 200);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'COMPLETED');
  } finally {
    if (proofPath) await unlink(proofPath).catch(() => undefined);
    if (orderId) await prisma.order.delete({ where: { id: orderId } });
    await prisma.cartItem.deleteMany({ where: { cart: { userId: customerId } } });
    if (merchantId) await prisma.merchant.delete({ where: { id: merchantId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, adminId].filter(Boolean) } } });
  }
});
