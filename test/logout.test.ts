import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { randomInt } from 'node:crypto';

test('authenticated clients can log out', async () => {
  const response = await request(app).post('/api/v1/auth/register').send({
    name: 'Logout Test',
    phone: `+855${randomInt(100000000, 999999999)}`,
    password: 'Logout-Strong-Password-123',
  });
  assert.equal(response.status, 201);
  try {
    const logout = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${response.body.accessToken}`);
    assert.equal(logout.status, 204);
  } finally {
    await prisma.user.delete({ where: { id: response.body.user.id } });
  }
});
