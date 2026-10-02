import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getTokenSecret } from '../src/services/auth.service.js';

test('Sprint 8 supports manual bank-transfer proof review', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const userIds: string[] = [];
  let merchantId = '';
  let categoryId = '';
  let addressId = '';
  let orderId = '';

  async function token(userId: string) {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('gz-buy-api')
      .setAudience('gz-buy-client')
      .setExpirationTime('1h')
      .sign(getTokenSecret());
  }

  try {
    const customer = await prisma.user.create({ data: { name: 'Payment Customer', phone: `pay-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash' } });
    const admin = await prisma.user.create({ data: { name: 'Payment Admin', phone: `admin-pay-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash', role: 'ADMIN' } });
    userIds.push(customer.id, admin.id);
    const customerToken = await token(customer.id);
    const adminToken = await token(admin.id);

    const address = await prisma.address.create({
      data: { userId: customer.id, recipientName: 'Payment Customer', phone: '+85512345678', province: 'Phnom Penh', district: 'Daun Penh', commune: 'Srah Chak', addressLine: 'Payment Street', isDefault: true },
    });
    addressId = address.id;
    const category = await prisma.category.create({ data: { name: `Payment Category ${suffix}`, slug: `payment-category-${suffix}` } });
    categoryId = category.id;
    const merchant = await prisma.merchant.create({ data: { name: `Payment Store ${suffix}`, slug: `payment-store-${suffix}`, phone: `+855${suffix}`, status: 'ACTIVE' } });
    merchantId = merchant.id;
    const product = await prisma.product.create({
      data: {
        merchantId,
        categoryId,
        name: 'Payment Product',
        slug: `payment-product-${suffix}`,
        description: 'Product for manual payment verification.',
        status: 'ACTIVE',
        variants: { create: { name: 'Default', sku: `PAY-${suffix}`, price: '25.00', inventory: { create: { quantity: 5 } } } },
      },
      include: { variants: true },
    });

    const add = await request(app).post('/api/v1/cart/items').set('Authorization', `Bearer ${customerToken}`).send({ variantId: product.variants[0].id, quantity: 1 });
    assert.equal(add.status, 201);
    const checkout = await request(app).post('/api/v1/orders/checkout').set('Authorization', `Bearer ${customerToken}`).send({ addressId, paymentMethod: 'BANK_TRANSFER' });
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
    assert.equal(checkout.body.paymentInstructions.method, 'BANK_TRANSFER');
    assert.equal(checkout.body.paymentInstructions.proofUploadField, 'proof');
    orderId = checkout.body.order.id as string;
    const paymentId = checkout.body.order.payment.id as string;

    const proof = await request(app)
      .post(`/api/v1/payments/${paymentId}/proof`)
      .set('Authorization', `Bearer ${customerToken}`)
      .attach('proof', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfWQAAAAASUVORK5CYII=', 'base64'), { filename: 'transfer.png', contentType: 'image/png' });
    assert.equal(proof.status, 201);
    assert.equal(proof.body.payment.status, 'PROCESSING');
    assert.equal((await request(app).get(`/api/v1/payments/${paymentId}/proof`).set('Authorization', `Bearer ${customerToken}`)).status, 200);
    assert.equal((await request(app).get(`/api/v1/payments/${paymentId}/proof`).set('Authorization', `Bearer ${adminToken}`)).status, 200);
    const listed = await request(app).get('/api/v1/admin/payments').set('Authorization', `Bearer ${adminToken}`).query({ status: 'PROCESSING', limit: 100 });
    assert.ok(listed.body.payments.some((item: { id: string }) => item.id === paymentId));
    assert.equal('proofStoragePath' in proof.body.payment, false);

    const verified = await request(app).post(`/api/v1/admin/payments/${paymentId}/verify`).set('Authorization', `Bearer ${adminToken}`).send({});
    assert.equal(verified.status, 200);
    assert.equal(verified.body.payment.status, 'PAID');
    assert.equal((await request(app).post(`/api/v1/admin/payments/${paymentId}/verify`).set('Authorization', `Bearer ${adminToken}`).send({})).body.payment.status, 'PAID');
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'CONFIRMED');
  } finally {
    if (orderId) {
      const payment = await prisma.payment.findUnique({ where: { orderId } });
      if (payment?.proofStoragePath) await unlink(payment.proofStoragePath).catch(() => undefined);
      await prisma.order.delete({ where: { id: orderId } });
    }
    await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: userIds } } } });
    if (merchantId) await prisma.merchant.delete({ where: { id: merchantId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    if (addressId) await prisma.address.delete({ where: { id: addressId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});
