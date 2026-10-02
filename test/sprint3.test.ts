import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getTokenSecret } from '../src/services/auth.service.js';

test('Sprint 3 manages categories and moderates seller products', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const users: string[] = [];
  const merchants: string[] = [];
  const categories: string[] = [];

  async function account(role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER') {
    const user = await prisma.user.create({
      data: {
        name: `Sprint Three ${role}`,
        phone: `s3-${role}-${suffix}-${randomUUID().slice(0, 8)}`,
        passwordHash: 'unused-test-hash',
        role,
      },
    });
    users.push(user.id);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('gz-buy-api')
      .setAudience('gz-buy-client')
      .setExpirationTime('1h')
      .sign(getTokenSecret());
    return { id: user.id, token };
  }

  try {
    const owner = await account();
    const admin = await account('ADMIN');
    const outsider = await account();
    const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, token?: string) => {
      const req = request(app)[method](`/api/v1${path}`);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };

    const categoryInput = { name: 'Sprint Three Kitchen', slug: `s3-kitchen-${suffix}` };
    assert.equal((await call('post', '/admin/categories', owner.token).send(categoryInput)).status, 403);
    assert.equal((await call('post', '/admin/categories', admin.token).send({ ...categoryInput, status: 'ACTIVE' })).status, 400);

    const categoryResponse = await call('post', '/admin/categories', admin.token).send(categoryInput);
    assert.equal(categoryResponse.status, 201);
    const categoryId = categoryResponse.body.category.id as string;
    categories.push(categoryId);
    const childCategoryResponse = await call('post', '/admin/categories', admin.token).send({
      name: 'Sprint Three Subcategory',
      slug: `s3-subcategory-${suffix}`,
      parentId: categoryId,
    });
    assert.equal(childCategoryResponse.status, 201);
    categories.push(childCategoryResponse.body.category.id as string);
    assert.equal((await call('patch', `/admin/categories/${categoryId}`, admin.token)
      .send({ parentId: childCategoryResponse.body.category.id })).status, 400);

    const storeResponse = await call('post', '/seller/stores', owner.token).send({
      name: `Sprint Three Store ${suffix}`,
      slug: `sprint-three-store-${suffix}`,
      phone: '+85512345678',
    });
    assert.equal(storeResponse.status, 201);
    const merchantId = storeResponse.body.seller.id as string;
    merchants.push(merchantId);
    const storeProductsPath = `/seller/stores/${merchantId}/products`;
    const productInput = {
      categoryId,
      name: 'Demo Product for Review',
      slug: `demo-product-${suffix}`,
      description: 'Fictional product used to verify the moderation workflow.',
    };

    assert.equal((await call('post', storeProductsPath, owner.token).send(productInput)).status, 409);
    assert.equal((await call('post', `/admin/sellers/${merchantId}/approve`, admin.token).send({})).status, 200);

    const created = await call('post', storeProductsPath, owner.token).send(productInput);
    assert.equal(created.status, 201);
    assert.equal(created.body.product.status, 'DRAFT');
    const productId = created.body.product.id as string;
    const publicProductPath = `/products/${productId}`;

    const publicDraft = await call('get', publicProductPath);
    assert.equal(publicDraft.status, 404);

    const productList = await call('get', '/products').query({ categoryId });
    assert.equal(productList.status, 200);
    assert.equal(productList.body.products.total, 0);

    assert.equal((await call('get', storeProductsPath, outsider.token)).status, 404);
    assert.equal((await call('post', `${storeProductsPath}/${productId}/submit`, owner.token)).body.product.status, 'PENDING');
    assert.equal((await call('patch', `${storeProductsPath}/${productId}`, owner.token).send({ name: 'Changed while pending' })).status, 409);
    assert.equal((await call('post', `/admin/products/${productId}/approve`, owner.token).send({})).status, 403);
    assert.equal((await call('post', `/admin/products/${productId}/approve`, admin.token).send({})).body.product.status, 'ACTIVE');
    assert.equal((await call('get', publicProductPath)).body.product.status, 'ACTIVE');

    const filteredList = await call('get', '/products').query({ categoryId, search: 'Demo Product' });
    assert.equal(filteredList.body.products.total, 1);
    assert.equal(filteredList.body.products.products[0].id, productId);

    const edited = await call('patch', `${storeProductsPath}/${productId}`, owner.token).send({ name: 'Updated Product Name' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.product.status, 'PENDING');
    assert.equal((await call('get', publicProductPath)).status, 404);

    assert.equal((await call('post', `/admin/products/${productId}/reject`, admin.token).send({})).body.product.status, 'REJECTED');
    assert.equal((await call('post', `${storeProductsPath}/${productId}/submit`, owner.token)).body.product.status, 'PENDING');
    assert.equal((await call('post', `/admin/products/${productId}/approve`, admin.token).send({})).body.product.status, 'ACTIVE');

    assert.equal((await call('patch', `/admin/categories/${categoryId}`, admin.token).send({ name: 'Updated Kitchen' })).status, 200);
    assert.equal((await call('delete', `/admin/categories/${categoryId}`, admin.token)).status, 409);
    assert.equal((await call('get', '/admin/products?status=PENDING', admin.token)).status, 200);
  } finally {
    await prisma.merchant.deleteMany({ where: { id: { in: merchants } } });
    await prisma.category.deleteMany({ where: { id: { in: categories } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
});