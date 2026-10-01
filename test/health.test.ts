import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import app from '../src/app.js';

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

test('GET /api-docs serves the Swagger UI', async () => {
  const response = await request(app).get('/api-docs/');

  assert.equal(response.status, 200);
  assert.match(response.text, /Swagger UI/);
});