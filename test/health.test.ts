import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

test('GET /api/v1/health returns API status', async () => {
  const response = await request(app).get('/api/v1/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.ok(Number.isNaN(Date.parse(response.body.timestamp)) === false);
});

test('unknown routes return a JSON 404', async () => {
  const response = await request(app).get('/missing');

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: { message: 'Route not found' } });
});

test('GET /docs serves the Swagger UI', async () => {
  const response = await request(app).get('/docs/');

  assert.equal(response.status, 200);
  assert.match(response.text, /Swagger UI/);
});

test('readiness confirms the migrated database', async () => {
  const response = await request(app).get('/api/v1/health/ready');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ready');
});

test('readiness fails without exposing database errors', async () => {
  // Prisma exposes methods through a proxy rather than normal descriptors.
  const original = prisma.$queryRaw;
  prisma.$queryRaw = (async () => { throw new Error('private connection details'); }) as typeof prisma.$queryRaw;
  try {
    const response = await request(app).get('/api/v1/health/ready');
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { status: 'unavailable' });
  } finally { prisma.$queryRaw = original; }
});
