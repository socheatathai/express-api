import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getTokenSecret } from '../src/services/auth.service.js';

test('Sprint 4 manages images, variants, SKUs, prices, and inventory', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const userIds: string[] = [];
  let merchantId = '';
  let categoryId = '';
  let productId = '';

  try {
    const user = await prisma.user.create({
      data: {
        name: 'Sprint Four Owner',
        phone: `s4-${suffix}-${randomUUID().slice(0, 8)}`,
        passwordHash: 'unused-test-hash',
      },
    });
    userIds.push(user.id);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('gz-buy-api')
      .setAudience('gz-buy-client')
      .setExpirationTime('1h')
      .sign(getTokenSecret());

    const merchant = await prisma.merchant.create({
      data: {
        name: `Sprint Four Store ${suffix}`,
        slug: `sprint-four-store-${suffix}`,
        phone: `+855${suffix}`,
        status: 'ACTIVE',
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    });
    merchantId = merchant.id;
    const category = await prisma.category.create({ data: { name: `Sprint Four Category ${suffix}`, slug: `sprint-four-category-${suffix}` } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        merchantId,
        categoryId,
        name: 'Sprint Four Product',
        slug: `sprint-four-product-${suffix}`,
        description: 'Product for Sprint 4 API coverage.',
        status: 'DRAFT',
      },
    });
    productId = product.id;
    const base = `/api/v1/seller/stores/${merchantId}/products/${productId}`;
    const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string) => {
      const req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
      return req;
    };

    const image = await call('post', `${base}/images`).send({ url: 'https://cdn.example.com/product.jpg', sortOrder: 2 });
    assert.equal(image.status, 201);
    assert.equal(image.body.image.sortOrder, 2);
    assert.equal((await call('get', `${base}/images`)).body.images.length, 1);
    assert.equal((await call('patch', `${base}/images/${image.body.image.id}`).send({ sortOrder: 1 })).body.image.sortOrder, 1);

    const variant = await call('post', `${base}/variants`).send({ name: 'Black / M', sku: `S4-${suffix}`, price: '19.90' });
    assert.equal(variant.status, 201);
    assert.equal(Number(variant.body.variant.price), 19.9);
    assert.equal((await call('post', `${base}/variants`).send({ name: 'Black / L', sku: `S4-${suffix}`, price: '20.00' })).status, 409);
    assert.equal(Number((await call('patch', `${base}/variants/${variant.body.variant.id}`).send({ price: '21.50' })).body.variant.price), 21.5);

    const inventoryPath = `${base}/variants/${variant.body.variant.id}/inventory`;
    assert.equal((await call('patch', inventoryPath).send({ quantity: 10 })).status, 200);
    await prisma.inventory.update({ where: { variantId: variant.body.variant.id }, data: { reservedQuantity: 3 } });
    const inventory = await call('patch', inventoryPath).send({ quantity: 10 });
    assert.equal(inventory.body.inventory.quantity - inventory.body.inventory.reservedQuantity, 7);
    assert.equal((await call('patch', inventoryPath).send({ quantity: 2 })).status, 409);

    assert.equal((await call('patch', inventoryPath).send({ quantity: 10, reservedQuantity: 0 })).status, 400);

    const outsider = await prisma.user.create({
      data: { name: 'Sprint Four Outsider', phone: `s4-out-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash' },
    });
    userIds.push(outsider.id);
    const outsiderToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(outsider.id)
      .setIssuer('gz-buy-api')
      .setAudience('gz-buy-client')
      .setExpirationTime('1h')
      .sign(getTokenSecret());
    assert.equal((await request(app).get(`${base}/variants`).set('Authorization', `Bearer ${outsiderToken}`)).status, 404);
  } finally {
    if (merchantId) await prisma.merchant.delete({ where: { id: merchantId } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});
