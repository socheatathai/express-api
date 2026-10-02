import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import app from '../src/app.js';

test('request IDs are returned and malformed caller IDs are replaced', async () => {
  const response = await request(app)
    .get('/missing')
    .set('X-Request-ID', 'not-a-uuid');

  assert.equal(response.status, 404);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
  assert.notEqual(response.headers['x-request-id'], 'not-a-uuid');
  assert.ok(response.headers['ratelimit-policy']);
});

test('request IDs from Nginx are preserved', async () => {
  const nginxRequestId = '0123456789abcdef0123456789abcdef';
  const response = await request(app)
    .get('/api/v1/health')
    .set('X-Request-ID', nginxRequestId);

  assert.equal(response.headers['x-request-id'], nginxRequestId);
});

test('CORS allows configured origins and denies unconfigured origins', async () => {
  const allowed = await request(app)
    .get('/api/v1/health')
    .set('Origin', 'http://localhost:5173');
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173');

  const denied = await request(app)
    .get('/api/v1/health')
    .set('Origin', 'https://untrusted.example');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});

test('CORS answers preflight for an allowed origin', async () => {
  const response = await request(app)
    .options('/api/v1/addresses')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type');

  assert.equal(response.status, 204);
  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
});

test('API writes require JSON content type', async () => {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('Content-Type', 'text/plain')
    .send('identifier=user&password=secret');

  assert.equal(response.status, 415);
  assert.deepEqual(response.body, { error: { message: 'Content-Type must be application/json' } });
});

test('JSON request bodies are limited to 1 MB', async () => {
  const body = JSON.stringify({ payload: 'x'.repeat(1024 * 1024) });
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('Content-Type', 'application/json')
    .send(body);

  assert.equal(response.status, 413);
  assert.equal(typeof response.body.error.message, 'string');
});