import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getTokenSecret } from '../src/services/auth.service.js';

test('Sprint 2 enforces onboarding, admin transitions and store membership roles', async () => {
  const suffix = randomUUID();
  const users: string[] = [];
  const stores: string[] = [];
  async function account(role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER') {
    const user = await prisma.user.create({ data: { name: 'Sprint Two', phone: `test-${randomUUID()}`, passwordHash: 'unused-test-hash', role } });
    users.push(user.id);
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuer('gz-buy-api').setAudience('gz-buy-client').setExpirationTime('1h').sign(getTokenSecret());
    return { id: user.id, token };
  }
  try {
    const owner = await account(); const admin = await account('ADMIN'); const manager = await account(); const staff = await account(); const outsider = await account();
    const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, token: string) => request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
    assert.equal((await request(app).get('/api/v1/seller/stores')).status, 401);
    assert.equal((await call('get', '/admin/sellers', owner.token)).status, 403);
    assert.equal((await call('post', '/seller/stores', owner.token).send({ name: 'Bad Store', slug: 'bad', phone: '+85512345678', status: 'ACTIVE' })).status, 400);
    const input = { name: 'Test Store', slug: `test-${suffix}`, phone: '+85512345678' };
    const created = await call('post', '/seller/stores', owner.token).send(input);
    assert.equal(created.status, 201); assert.equal(created.body.seller.status, 'PENDING');
    const id = created.body.seller.id; stores.push(id);
    const base = `/seller/stores/${id}`; const approval = `/admin/sellers/${id}`;
    assert.equal((await prisma.merchantMember.findUniqueOrThrow({ where: { merchantId_userId: { merchantId: id, userId: owner.id } } })).role, 'OWNER');
    assert.equal((await call('post', '/seller/stores', owner.token).send(input)).status, 409);
    assert.equal((await call('get', base, outsider.token)).status, 404);
    assert.equal((await call('get', '/seller/stores', outsider.token)).body.sellers.length, 0);
    assert.equal((await call('post', `${base}/members`, owner.token).send({ userId: manager.id, role: 'MANAGER' })).status, 409);
    assert.equal((await call('post', `${approval}/approve`, owner.token).send({})).status, 403);
    assert.equal((await call('post', `${approval}/suspend`, admin.token).send({})).status, 409);
    const approved = await call('post', `${approval}/approve`, admin.token).send({});
    assert.equal(approved.status, 200); assert.equal(approved.body.seller.status, 'ACTIVE');
    assert.equal((await call('post', `${approval}/approve`, admin.token).send({})).status, 409);
    for (const [user, role] of [[manager, 'MANAGER'], [staff, 'STAFF']] as const) {
      assert.equal((await call('post', `${base}/members`, owner.token).send({ userId: user.id, role })).status, 201);
      assert.equal((await call('get', base, user.token)).status, 200);
      assert.equal((await call('get', `${base}/members`, user.token)).status, 200);
      assert.equal((await call('post', `${base}/members`, user.token).send({ userId: outsider.id, role: 'STAFF' })).status, 403);
    }
    assert.equal((await call('post', `${base}/members`, owner.token).send({ userId: outsider.id, role: 'OWNER' })).status, 400);
    assert.equal((await call('patch', `${base}/members/${owner.id}`, owner.token).send({ role: 'STAFF' })).status, 403);
    assert.equal((await call('delete', `${base}/members/${owner.id}`, owner.token)).status, 403);
    assert.equal((await call('patch', `${base}/members/${manager.id}`, owner.token).send({ role: 'STAFF' })).status, 200);
    assert.equal((await call('delete', `${base}/members/${staff.id}`, owner.token)).status, 204);
    assert.equal((await call('get', base, staff.token)).status, 404);
    assert.equal((await call('get', '/admin/sellers?limit=101', admin.token)).status, 400);
    const listed = await call('get', '/admin/sellers?status=ACTIVE&limit=1', admin.token);
    assert.equal(listed.status, 200); assert.equal(listed.body.limit, 1); assert.ok(listed.body.total >= 1);
    assert.equal((await call('post', `${approval}/suspend`, admin.token).send({})).status, 200);
    assert.equal((await call('post', `${base}/members`, owner.token).send({ userId: outsider.id, role: 'STAFF' })).status, 409);
    assert.equal((await call('post', `${approval}/reject`, admin.token).send({})).status, 409);
    assert.equal((await call('post', `${approval}/approve`, admin.token).send({})).status, 200);
    const rejected = await call('post', '/seller/stores', owner.token).send({ ...input, slug: `rejected-${suffix}` });
    assert.equal(rejected.status, 201); stores.push(rejected.body.seller.id);
    assert.equal((await call('post', `/admin/sellers/${rejected.body.seller.id}/reject`, admin.token).send({})).body.seller.status, 'REJECTED');
    assert.equal((await call('post', `/admin/sellers/${rejected.body.seller.id}/approve`, admin.token).send({})).status, 409);
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'CUSTOMER' } });
    assert.equal((await call('get', '/admin/sellers', admin.token)).status, 403);
    await prisma.user.update({ where: { id: owner.id }, data: { status: 'SUSPENDED' } });
    assert.equal((await call('get', base, owner.token)).status, 401);
  } finally {
    await prisma.merchant.deleteMany({ where: { id: { in: stores } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
});
