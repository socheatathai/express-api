import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

test('Sprint 5 exposes only sellable products with sorting and availability', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  let merchantId = '';
  let categoryId = '';
  const productIds: string[] = [];

  try {
    const merchant = await prisma.merchant.create({
      data: {
        name: `Sprint Five Store ${suffix}`,
        slug: `sprint-five-store-${suffix}`,
        phone: `+855${suffix}`,
        status: 'ACTIVE',
      },
    });
    merchantId = merchant.id;
    const category = await prisma.category.create({ data: { name: `Sprint Five Category ${suffix}`, slug: `sprint-five-category-${suffix}` } });
    categoryId = category.id;

    async function product(name: string, slug: string, withVariant: boolean, quantity = 0, reservedQuantity = 0) {
      const created = await prisma.product.create({
        data: {
          merchantId,
          categoryId,
          name,
          slug: `${slug}-${suffix}`,
          description: `${name} description`,
          status: 'ACTIVE',
          ...(withVariant ? {
            variants: {
              create: {
                name: 'Default',
                sku: `S5-${slug}-${suffix}`,
                price: '10.00',
                inventory: { create: { quantity, reservedQuantity } },
              },
            },
          } : {}),
        },
      });
      productIds.push(created.id);
      return created.id;
    }

    const alphaId = await product('Alpha Product', 'alpha', true, 10, 4);
    await product('Beta Product', 'beta', true, 2, 2);
    await product('Hidden Empty Product', 'empty', false);

    const sorted = await request(app).get('/api/v1/products').query({ categoryId, sort: 'name_desc' });
    assert.equal(sorted.status, 200);
    assert.equal(sorted.body.products.total, 3);
    assert.deepEqual(sorted.body.products.products.map((item: { name: string }) => item.name), ['Hidden Empty Product', 'Beta Product', 'Alpha Product']);

    const detail = await request(app).get(`/api/v1/products/${alphaId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.product.variants[0].availableQuantity, 6);
    assert.equal((await request(app).get('/api/v1/products').query({ sort: 'unsupported' })).status, 400);
  } finally {
    if (merchantId) await prisma.merchant.delete({ where: { id: merchantId } });
    if (productIds.length) await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
  }
});
