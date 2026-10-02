import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getTokenSecret } from '../src/services/auth.service.js';

test('Sprints 6 and 7 manage carts and transactional multi-merchant checkout', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const userIds: string[] = [];
  const orderIds: string[] = [];
  const merchantIds: string[] = [];
  let categoryId = '';
  let addressId = '';
  let firstVariantId = '';
  let secondVariantId = '';
  let lowStockVariantId = '';

  try {
    const user = await prisma.user.create({
      data: { name: 'Sprint Six Customer', phone: `s67-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'unused-test-hash' },
    });
    userIds.push(user.id);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('gz-buy-api')
      .setAudience('gz-buy-client')
      .setExpirationTime('1h')
      .sign(getTokenSecret());
    const auth = (method: 'get' | 'post' | 'patch' | 'delete', path: string) => request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);

    const address = await prisma.address.create({
      data: {
        userId: user.id,
        recipientName: 'Checkout Customer',
        phone: '+85512345678',
        province: 'Phnom Penh',
        district: 'Chamkar Mon',
        commune: 'Boeung Keng Kang',
        addressLine: '123 Test Street',
        isDefault: true,
      },
    });
    addressId = address.id;
    const category = await prisma.category.create({ data: { name: `Sprint 67 Category ${suffix}`, slug: `sprint-67-category-${suffix}` } });
    categoryId = category.id;

    async function merchant(name: string, slug: string) {
      const created = await prisma.merchant.create({
        data: { name, slug: `${slug}-${suffix}`, phone: `+855${suffix}`, status: 'ACTIVE' },
      });
      merchantIds.push(created.id);
      return created.id;
    }

    async function product(merchantId: string, name: string, slug: string, sku: string, quantity: number) {
      const created = await prisma.product.create({
        data: {
          merchantId,
          categoryId,
          name,
          slug: `${slug}-${suffix}`,
          description: `${name} description`,
          status: 'ACTIVE',
          variants: {
            create: {
              name: 'Default',
              sku: `${sku}-${suffix}`,
              price: '12.50',
              inventory: { create: { quantity, reservedQuantity: 0 } },
            },
          },
        },
        include: { variants: true },
      });
      return created.variants[0].id;
    }

    firstVariantId = await product(await merchant('First Store', 'first-store'), 'First Product', 'first-product', 'FIRST', 10);
    secondVariantId = await product(await merchant('Second Store', 'second-store'), 'Second Product', 'second-product', 'SECOND', 5);

    assert.equal((await auth('get', '/cart')).body.cart.items.length, 0);
    assert.equal((await auth('post', '/cart/items').send({ variantId: firstVariantId, quantity: 2 })).status, 201);
    const duplicate = await auth('post', '/cart/items').send({ variantId: firstVariantId, quantity: 1 });
    assert.equal(duplicate.status, 201);
    assert.equal(duplicate.body.cart.items[0].quantity, 3);
    assert.equal((await auth('post', '/cart/items').send({ variantId: secondVariantId, quantity: 2 })).status, 201);

    const checkout = await auth('post', '/orders/checkout').send({ addressId, paymentMethod: 'BANK_TRANSFER' });
    assert.equal(checkout.status, 201);
    const order = checkout.body.order;
    orderIds.push(order.id);
    assert.equal(order.status, 'PENDING');
    assert.equal(order.payment.method, 'BANK_TRANSFER');
    assert.equal(order.payment.status, 'PENDING');
    assert.equal(order.merchantOrders.length, 2);
    assert.equal(order.merchantOrders[0].items[0].productName, 'First Product');
    assert.equal(JSON.parse(order.shippingAddress).addressLine, '123 Test Street');
    assert.equal((await auth('get', '/cart')).body.cart.items.length, 0);

    const reserved = await prisma.inventory.findMany({ where: { variantId: { in: [firstVariantId, secondVariantId] } } });
    assert.deepEqual(reserved.map((item) => item.reservedQuantity).sort(), [2, 3]);

    lowStockVariantId = await product(merchantIds[0], 'Low Stock Product', 'low-stock-product', 'LOW', 1);
    assert.equal((await auth('post', '/cart/items').send({ variantId: lowStockVariantId, quantity: 2 })).status, 201);
    const failedCheckout = await auth('post', '/orders/checkout').send({ addressId, paymentMethod: 'BANK_TRANSFER' });
    assert.equal(failedCheckout.status, 409);
    assert.equal((await prisma.inventory.findUniqueOrThrow({ where: { variantId: lowStockVariantId } })).reservedQuantity, 0);
  } finally {
    if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: userIds } } } });
    if (merchantIds.length) await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (addressId) await prisma.address.deleteMany({ where: { id: addressId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});
