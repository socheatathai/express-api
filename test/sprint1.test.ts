import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

test('Sprint 1 supports customer auth and owned address management', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const phone = `+855${randomInt(100000000, 999999999)}`;
  const otherPhone = `+855${randomInt(100000000, 999999999)}`;
  const email = `sprint1-${suffix}@example.test`;
  const password = 'correct-horse-battery-12';

  try {
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Sprint One Customer', phone, email, password });

    assert.equal(registration.status, 201);
    assert.equal(registration.body.user.phone, phone);
    assert.equal('passwordHash' in registration.body.user, false);
    assert.equal(registration.body.tokenType, 'Bearer');
    const accessToken = registration.body.accessToken as string;
    assert.ok(accessToken);

    const duplicate = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Duplicate Customer', phone, password });
    assert.equal(duplicate.status, 409);

    const invalidLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: phone, password: 'wrong-password' });
    assert.equal(invalidLogin.status, 401);

    const oversizedPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: phone, password: 'x'.repeat(73) });
    assert.equal(oversizedPassword.status, 400);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: email, password });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, registration.body.user.id);

    const currentUser = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    assert.equal(currentUser.status, 200);
    assert.equal(currentUser.body.user.id, registration.body.user.id);

    const unauthenticatedAddresses = await request(app).get('/api/v1/addresses');
    assert.equal(unauthenticatedAddresses.status, 401);

    const firstAddress = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        recipientName: 'Sprint One Customer',
        phone,
        province: 'Phnom Penh',
        district: 'Chamkar Mon',
        commune: 'Boeung Keng Kang 1',
        addressLine: 'Street 123',
      });
    assert.equal(firstAddress.status, 201);
    assert.equal(firstAddress.body.address.isDefault, true);

    const secondAddress = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        recipientName: 'Sprint One Customer',
        phone,
        province: 'Kandal',
        district: 'Ta Khmau',
        commune: 'Ta Khmau',
        addressLine: 'Road 1',
        isDefault: true,
      });
    assert.equal(secondAddress.status, 201);

    const addresses = await request(app)
      .get('/api/v1/addresses')
      .set('Authorization', `Bearer ${accessToken}`);
    assert.equal(addresses.status, 200);
    assert.equal(addresses.body.addresses.length, 2);
    assert.equal(addresses.body.addresses.filter((address: { isDefault: boolean }) => address.isDefault).length, 1);
    assert.equal(addresses.body.addresses[0].id, secondAddress.body.address.id);

    const otherRegistration = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Other Customer', phone: otherPhone, password });
    assert.equal(otherRegistration.status, 201);

    const foreignAddress = await request(app)
      .get(`/api/v1/addresses/${firstAddress.body.address.id}`)
      .set('Authorization', `Bearer ${otherRegistration.body.accessToken}`);
    assert.equal(foreignAddress.status, 404);

    const updatedAddress = await request(app)
      .patch(`/api/v1/addresses/${firstAddress.body.address.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ landmark: 'Near the market' });
    assert.equal(updatedAddress.status, 200);
    assert.equal(updatedAddress.body.address.landmark, 'Near the market');

    const deletedAddress = await request(app)
      .delete(`/api/v1/addresses/${firstAddress.body.address.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    assert.equal(deletedAddress.status, 204);
  } finally {
    await prisma.user.deleteMany({ where: { phone: { in: [phone, otherPhone] } } });
  }
});