import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import request from 'supertest';
import { SignJWT } from 'jose';
import app from '../src/app.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';
import { getTokenSecret } from '../src/services/auth.service.js';
import { rejectPayment, submitProof, verifyPayment } from '../src/services/payment.service.js';
import { cancelMerchantOrder, transitionMerchantOrder } from '../src/services/merchant-order.service.js';
import { createShipment, updateShipment } from '../src/services/shipment.service.js';
import { updateInventory, createProductImage, updateProductVariant } from '../src/services/product.service.js';
import { expireUnpaidOrders } from '../src/services/order-expiry.service.js';
import { updateCategory } from '../src/services/category.service.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfWQAAAAASUVORK5CYII=', 'base64');
const conflict = (error: unknown) => typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 409;

async function fixture() {
  const key = randomUUID();
  const users: string[] = [];
  const merchants: string[] = [];
  const orders: string[] = [];
  const files: string[] = [];
  const categories: string[] = [];
  async function user(role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER') {
    const created = await prisma.user.create({ data: { name: 'Regression User', phone: `reg-${randomUUID()}`, passwordHash: 'unused-test-hash', role } });
    users.push(created.id);
    return created;
  }
  const customer = await user();
  const owner = await user();
  const admin = await user('ADMIN');
  const outsider = await user();
  const category = await prisma.category.create({ data: { name: 'Regression Category', slug: `reg-${key}` } });
  categories.push(category.id);
  const products: Array<Prisma.ProductGetPayload<{ include: { variants: true } }>> = [];
  for (let index = 0; index < 2; index += 1) {
    const merchant = await prisma.merchant.create({ data: { name: 'Regression Store', slug: `reg-store-${index}-${key}`, phone: '+85512345678', status: 'ACTIVE', members: { create: { userId: owner.id, role: 'OWNER' } } } });
    merchants.push(merchant.id);
    products.push(await prisma.product.create({ data: { merchantId: merchant.id, categoryId: category.id, name: 'Regression Product', slug: `reg-product-${index}-${key}`, description: 'Regression product', status: 'ACTIVE', variants: { create: { name: 'Default', sku: `REG-${index}-${key}`, price: '10.00', inventory: { create: { quantity: 50 } } } } }, include: { variants: true } }));
  }
  async function order(options: { paid?: boolean; submitted?: boolean; quantities?: number[]; ready?: boolean; old?: boolean } = {}) {
    const quantities = options.quantities ?? [2];
    const amount = quantities.reduce((sum, value) => sum + value * 10, 0).toFixed(2);
    const created = await prisma.order.create({ data: {
      userId: customer.id, status: options.paid ? 'CONFIRMED' : 'PENDING', subtotal: amount, total: amount,
      recipientName: 'Regression Customer', recipientPhone: '+85512345678', shippingAddress: '{}',
      ...(options.old ? { createdAt: new Date(Date.now() - 366 * 86400000) } : {}),
      payment: { create: { method: 'BANK_TRANSFER', status: options.paid ? 'PAID' : options.submitted ? 'PROCESSING' : 'PENDING', amount, ...(options.submitted ? { proofStoragePath: 'regression-proof-placeholder' } : {}) } },
      merchantOrders: { create: quantities.map((quantity, index) => ({
        merchantId: merchants[index], status: options.ready ? 'READY_FOR_PICKUP' as const : 'PENDING' as const,
        subtotal: (quantity * 10).toFixed(2), total: (quantity * 10).toFixed(2),
        items: { create: { productId: products[index].id, variantId: products[index].variants[0].id, productName: 'Regression Product', variantName: 'Default', sku: products[index].variants[0].sku, unitPrice: '10.00', quantity, subtotal: (quantity * 10).toFixed(2) } },
      })) },
    }, include: { payment: true, merchantOrders: { orderBy: { merchantId: 'asc' } } } });
    orders.push(created.id);
    for (let index = 0; index < quantities.length; index += 1) await prisma.inventory.update({ where: { variantId: products[index].variants[0].id }, data: { reservedQuantity: { increment: quantities[index] } } });
    return created;
  }
  function child(created: Awaited<ReturnType<typeof order>>, index = 0) { return created.merchantOrders.find((item) => item.merchantId === merchants[index])!; }
  async function file() {
    await mkdir('uploads/payment-proofs', { recursive: true });
    const filename = path.resolve(`uploads/payment-proofs/reg-${randomUUID()}.png`);
    await writeFile(filename, png);
    files.push(filename);
    return { path: filename, mimetype: 'image/png' } as Express.Multer.File;
  }
  async function token(id: string) { return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(id).setIssuer('gz-buy-api').setAudience('gz-buy-client').setExpirationTime('1h').sign(getTokenSecret()); }
  async function stock(index = 0) { return prisma.inventory.findUniqueOrThrow({ where: { variantId: products[index].variants[0].id } }); }
  async function cleanup() {
    await prisma.order.deleteMany({ where: { id: { in: orders } } });
    await prisma.merchant.deleteMany({ where: { id: { in: merchants } } });
    await prisma.category.deleteMany({ where: { id: { in: categories } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await Promise.all(files.map((filename) => unlink(filename).catch(() => undefined)));
  }
  return { customer, owner, admin, outsider, category, categories, merchants, products, order, child, file, token, stock, cleanup };
}

test('rejection cancels children once, preserves other reservations, and blocks repayment', async () => {
  const f = await fixture();
  try {
    const rejected = await f.order({ submitted: true });
    await f.order(); // A different customer's checkout reservation must remain intact.
    const attempts = await Promise.all([rejectPayment(f.admin.id, rejected.payment!.id, {}), rejectPayment(f.admin.id, rejected.payment!.id, {})]);
    assert.ok(attempts.every((item) => item.status === 'FAILED'));
    assert.equal((await f.stock()).reservedQuantity, 2);
    const cancelled = await cancelMerchantOrder(f.owner.id, f.merchants[0], f.child(rejected).id);
    assert.equal(cancelled.merchantOrder.status, 'CANCELLED');
    assert.equal((await f.stock()).reservedQuantity, 2);
    await assert.rejects(submitProof(f.customer.id, rejected.payment!.id, await f.file()), conflict);
    await assert.rejects(verifyPayment(f.admin.id, rejected.payment!.id), conflict);
    await assert.rejects(transitionMerchantOrder(f.owner.id, f.merchants[0], f.child(rejected).id, 'accept'), conflict);
  } finally { await f.cleanup(); }
});

test('simultaneous verification and rejection cannot both succeed', async () => {
  const f = await fixture();
  try {
    const created = await f.order({ submitted: true });
    const outcomes = await Promise.allSettled([verifyPayment(f.admin.id, created.payment!.id), rejectPayment(f.admin.id, created.payment!.id, {})]);
    assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
    assert.ok(outcomes.some((item) => item.status === 'rejected' && conflict(item.reason)));
    const result = await prisma.order.findUniqueOrThrow({ where: { id: created.id }, include: { payment: true, merchantOrders: true } });
    if (result.payment!.status === 'PAID') {
      assert.equal(result.status, 'CONFIRMED');
      assert.equal((await f.stock()).reservedQuantity, 2);
    } else {
      assert.equal(result.status, 'CANCELLED');
      assert.equal(result.merchantOrders[0].status, 'CANCELLED');
      assert.equal((await f.stock()).reservedQuantity, 0);
    }
  } finally { await f.cleanup(); }
});

test('proof replacement cannot overwrite verification and obsolete files are deleted', async () => {
  const f = await fixture();
  try {
    const created = await f.order();
    const first = await f.file();
    await submitProof(f.customer.id, created.payment!.id, first);
    const replacement = await f.file();
    await submitProof(f.customer.id, created.payment!.id, replacement);
    const { access } = await import('node:fs/promises');
    await assert.rejects(access(first.path));
    const outcomes = await Promise.allSettled([submitProof(f.customer.id, created.payment!.id, await f.file()), verifyPayment(f.admin.id, created.payment!.id)]);
    assert.equal(outcomes[1].status, 'fulfilled');
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: created.payment!.id } })).status, 'PAID');
  } finally { await f.cleanup(); }
});

test('unpaid fulfillment is denied and concurrent cancellation releases stock once', async () => {
  const f = await fixture();
  try {
    const unpaid = await f.order({ ready: true });
    await assert.rejects(createShipment(f.owner.id, f.merchants[0], f.child(unpaid).id, {}), conflict);
    const pending = await f.order();
    await assert.rejects(transitionMerchantOrder(f.owner.id, f.merchants[0], f.child(pending).id, 'accept'), conflict);
    const paid = await f.order({ paid: true, ready: true });
    await createShipment(f.owner.id, f.merchants[0], f.child(paid).id, {});
    await Promise.all([cancelMerchantOrder(f.owner.id, f.merchants[0], f.child(paid).id), cancelMerchantOrder(f.owner.id, f.merchants[0], f.child(paid).id)]);
    assert.equal((await f.stock()).reservedQuantity, 4);
    await assert.rejects(updateShipment(f.owner.id, f.merchants[0], f.child(paid).id, { status: 'READY_FOR_PICKUP' }), conflict);
  } finally { await f.cleanup(); }
});

test('pickup consumes stock once and simultaneous final deliveries complete the parent', async () => {
  const f = await fixture();
  try {
    const created = await f.order({ paid: true, ready: true, quantities: [2, 3] });
    for (let index = 0; index < 2; index += 1) {
      const child = f.child(created, index);
      await createShipment(f.owner.id, f.merchants[index], child.id, {});
      await updateShipment(f.owner.id, f.merchants[index], child.id, { status: 'READY_FOR_PICKUP' });
      const pickups = await Promise.all([updateShipment(f.owner.id, f.merchants[index], child.id, { status: 'PICKED_UP' }), updateShipment(f.owner.id, f.merchants[index], child.id, { status: 'PICKED_UP' })]);
      assert.ok(pickups.every((shipment) => shipment.shippedAt));
      assert.equal((await f.stock(index)).quantity, index === 0 ? 48 : 47);
      assert.equal((await f.stock(index)).reservedQuantity, 0);
      await updateShipment(f.owner.id, f.merchants[index], child.id, { status: 'IN_TRANSIT' });
      await updateShipment(f.owner.id, f.merchants[index], child.id, { status: 'OUT_FOR_DELIVERY' });
    }
    const delivered = await Promise.all([0, 1].map((index) => updateShipment(f.owner.id, f.merchants[index], f.child(created, index).id, { status: 'DELIVERED' })));
    assert.ok(delivered.every((shipment) => shipment.deliveredAt));
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: created.id } })).status, 'COMPLETED');
    await updateShipment(f.owner.id, f.merchants[0], f.child(created).id, { status: 'DELIVERED' });
    assert.equal((await f.stock()).quantity, 48);
  } finally { await f.cleanup(); }
});

test('a delivered and a cancelled child resolve the parent with a refund handoff', async () => {
  const f = await fixture();
  try {
    const created = await f.order({ paid: true, ready: true, quantities: [2, 3] });
    const cancelled = await cancelMerchantOrder(f.owner.id, f.merchants[1], f.child(created, 1).id);
    assert.equal(cancelled.refundRequired, true);
    await createShipment(f.owner.id, f.merchants[0], f.child(created).id, {});
    for (const status of ['READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const) await updateShipment(f.owner.id, f.merchants[0], f.child(created).id, { status });
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: created.id } })).status, 'COMPLETED');
    assert.equal((await f.stock(1)).quantity, 50);
    assert.equal((await f.stock(1)).reservedQuantity, 0);
  } finally { await f.cleanup(); }
});

test('seller stock updates preserve reservations and catalogue edits require review', async () => {
  const f = await fixture();
  try {
    await f.order();
    const product = f.products[0];
    await assert.rejects(updateInventory(f.owner.id, f.merchants[0], product.id, product.variants[0].id, { quantity: 1 }), conflict);
    const updated = await updateInventory(f.owner.id, f.merchants[0], product.id, product.variants[0].id, { quantity: 60 });
    assert.equal(updated.reservedQuantity, 2);
    await createProductImage(f.owner.id, f.merchants[0], product.id, { url: 'https://example.test/product.png', sortOrder: 0 });
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status, 'PENDING');
    await assert.rejects(updateProductVariant(f.owner.id, f.merchants[0], product.id, product.variants[0].id, { price: '12.00' }), conflict);
  } finally { await f.cleanup(); }
});

test('abandoned checkouts expire once while submitted proofs await review', async () => {
  const f = await fixture();
  try {
    const abandoned = await f.order({ old: true });
    const awaitingReview = await f.order({ old: true, submitted: true });
    await Promise.all([expireUnpaidOrders(), expireUnpaidOrders()]);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: abandoned.id } })).status, 'CANCELLED');
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: awaitingReview.id } })).status, 'PENDING');
    assert.equal((await f.stock()).reservedQuantity, 2);
  } finally { await f.cleanup(); }
});

test('customer orders and payment proofs enforce ownership, and spoofed images fail', async () => {
  const f = await fixture();
  try {
    const created = await f.order();
    const customerToken = await f.token(f.customer.id);
    const outsiderToken = await f.token(f.outsider.id);
    const proofPath = `/api/v1/payments/${created.payment!.id}/proof`;
    const fake = await request(app).post(proofPath).set('Authorization', `Bearer ${customerToken}`).attach('proof', Buffer.from('fake image'), { filename: 'fake.png', contentType: 'image/png' });
    assert.equal(fake.status, 400);
    const upload = await request(app).post(proofPath).set('Authorization', `Bearer ${customerToken}`).attach('proof', png, { filename: 'proof.png', contentType: 'image/png' });
    assert.equal(upload.status, 201);
    assert.equal('proofStoragePath' in upload.body.payment, false);
    // Track the HTTP-created file so the fixture removes it too.
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: created.payment!.id } });
    if (payment.proofStoragePath) await unlink(payment.proofStoragePath);
    assert.equal((await request(app).get(proofPath).set('Authorization', `Bearer ${outsiderToken}`)).status, 404);
    const detail = await request(app).get(`/api/v1/orders/${created.id}`).set('Authorization', `Bearer ${customerToken}`);
    assert.equal(detail.status, 200);
    assert.equal('proofStoragePath' in detail.body.order.payment, false);
    assert.equal((await request(app).get(`/api/v1/orders/${created.id}`).set('Authorization', `Bearer ${outsiderToken}`)).status, 404);
    const listed = await request(app).get('/api/v1/orders').set('Authorization', `Bearer ${customerToken}`);
    assert.equal(listed.body.total, 1);
    assert.equal((await request(app).get('/api/v1/orders?limit=101').set('Authorization', `Bearer ${customerToken}`)).status, 400);
  } finally { await f.cleanup(); }
});

test('simultaneous category reparenting cannot create a cycle', async () => {
  const f = await fixture();
  try {
    const other = await prisma.category.create({ data: { name: 'Other Regression Category', slug: `other-${randomUUID()}` } });
    f.categories.push(other.id);
    for (let attempt = 0; attempt < 10; attempt += 1) {
    await prisma.category.updateMany({ where: { id: { in: [f.category.id, other.id] } }, data: { parentId: null } });
    const outcomes = await Promise.allSettled([updateCategory(f.category.id, { parentId: other.id }), updateCategory(other.id, { parentId: f.category.id })]);
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = outcomes.find((result) => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected');
    assert.equal(rejected.reason.statusCode, 400, JSON.stringify(rejected.reason));
    }
  } finally { await f.cleanup(); }
});

test('shipment creation racing cancellation cannot revive an order', async () => {
  const f = await fixture();
  try {
    const created = await f.order({ paid: true, ready: true, quantities: [2, 3] });
    const child = f.child(created);
    const outcomes = await Promise.allSettled([
      createShipment(f.owner.id, f.merchants[0], child.id, {}),
      cancelMerchantOrder(f.owner.id, f.merchants[0], child.id),
    ]);
    assert.equal(outcomes[1].status, 'fulfilled');
    assert.equal((await prisma.merchantOrder.findUniqueOrThrow({ where: { id: child.id } })).status, 'CANCELLED');
    assert.equal((await f.stock()).reservedQuantity, 0);
    if (outcomes[0].status === 'fulfilled') await assert.rejects(updateShipment(f.owner.id, f.merchants[0], child.id, { status: 'READY_FOR_PICKUP' }), conflict);
    else assert.ok(conflict(outcomes[0].reason));
    assert.equal((await f.stock(1)).reservedQuantity, 3);
  } finally { await f.cleanup(); }
});

test('prices match database bounds and oversized checkout rolls back without clearing the cart', async () => {
  const f = await fixture();
  try {
    const token = await f.token(f.owner.id);
    const product = f.products[0];
    await prisma.product.update({ where: { id: product.id }, data: { status: 'DRAFT' } });
    const endpoint = `/api/v1/seller/stores/${f.merchants[0]}/products/${product.id}/variants/${product.variants[0].id}`;
    for (const price of ['0', '0.00', '10000000000.00', '1.001']) {
      assert.equal((await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ price })).status, 400);
    }
    assert.equal((await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ price: '9999999999.99' })).status, 200);
    await prisma.product.update({ where: { id: product.id }, data: { status: 'ACTIVE' } });
    const customerToken = await f.token(f.customer.id);
    const address = await prisma.address.create({ data: { userId: f.customer.id, recipientName: 'Test Customer', phone: '+85512345678', province: 'Phnom Penh', district: 'Test', commune: 'Test', addressLine: 'Test' } });
    assert.equal((await request(app).post('/api/v1/cart/items').set('Authorization', `Bearer ${customerToken}`).send({ variantId: product.variants[0].id, quantity: 2 })).status, 201);
    const checkout = await request(app).post('/api/v1/orders/checkout').set('Authorization', `Bearer ${customerToken}`).send({ addressId: address.id, paymentMethod: 'BANK_TRANSFER' });
    assert.equal(checkout.status, 400);
    assert.equal((await f.stock()).reservedQuantity, 0);
    assert.equal(await prisma.order.count({ where: { userId: f.customer.id } }), 0);
    assert.equal(await prisma.cartItem.count({ where: { cart: { userId: f.customer.id } } }), 1);
  } finally {
    await prisma.cartItem.deleteMany({ where: { cart: { userId: f.customer.id } } });
    await f.cleanup();
  }
});
