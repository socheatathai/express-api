import http from 'k6/http';
import exec from 'k6/execution';
import { sleep } from 'k6';
import { authSuccess, checkoutConflict, checkoutSuccess, checked, logoutSuccess } from './observability.js';

const baseUrl = (__ENV.BASE_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '');
let session;
let generatedCredentials;

function jsonHeaders(token) {
  return { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } };
}

function getSession() {
  if (session) return session;
  const phone = __ENV.K6_PHONE || generatedCredentials?.phone;
  const password = __ENV.K6_PASSWORD || generatedCredentials?.password;
  let response;
  if (phone && password) {
    response = http.post(`${baseUrl}/auth/login`, JSON.stringify({ identifier: phone, password }), jsonHeaders());
  } else {
    const runId = __ENV.K6_RUN_ID || String(Math.floor(exec.scenario.startTime / 1000));
    const uniquePhone = `+${runId}${String(exec.vu.idInTest).padStart(6, '0')}`;
    response = http.post(`${baseUrl}/auth/register`, JSON.stringify({ name: `k6-vu-${exec.vu.idInTest}`, phone: uniquePhone, password: 'K6-Strong-Password-123' }), jsonHeaders());
    if (response.status === 201) generatedCredentials = { phone: uniquePhone, password: 'K6-Strong-Password-123' };
  }
  checked(response, { 'auth succeeds': (item) => item.status === 200 || item.status === 201 });
  if (response.status !== 200 && response.status !== 201) return null;
  authSuccess.add(1);
  session = { token: response.json('accessToken') };
  return session;
}

function getProduct() {
  const response = http.get(`${baseUrl}/products`, { tags: { endpoint: 'products_list' } });
  checked(response, { 'products list succeeds': (item) => item.status === 200 });
  const body = response.status === 200 ? response.json() : null;
  return body?.products?.products?.[0]
    ? body.products.products[0]
    : null;
}

export function runUserFlow() {
  const current = __ENV.K6_SKIP_AUTH === 'true' ? null : getSession();
  const product = getProduct();
  if (product) {
    const detail = http.get(`${baseUrl}/products/${product.id}`, { tags: { endpoint: 'product_detail' } });
    checked(detail, { 'product detail succeeds': (item) => item.status === 200 });
  }
  const search = http.get(`${baseUrl}/products?search=${encodeURIComponent(__ENV.K6_SEARCH || 'Product')}`, { tags: { endpoint: 'product_search' } });
  checked(search, { 'product search succeeds': (item) => item.status === 200 });

  if (current) {
    const me = http.get(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${current.token}` }, tags: { endpoint: 'me' } });
    checked(me, { 'authenticated profile succeeds': (item) => item.status === 200 });
  }

  if (current && __ENV.K6_VARIANT_ID) {
    const cartItem = http.post(`${baseUrl}/cart/items`, JSON.stringify({ variantId: __ENV.K6_VARIANT_ID, quantity: 1 }), { ...jsonHeaders(current.token), tags: { endpoint: 'cart_add' } });
    checked(cartItem, { 'cart add succeeds': (item) => item.status === 201 });
    const cart = http.get(`${baseUrl}/cart`, { headers: { Authorization: `Bearer ${current.token}` }, tags: { endpoint: 'cart_get' } });
    checked(cart, { 'cart get succeeds': (item) => item.status === 200 });

    if (__ENV.K6_ENABLE_CHECKOUT === 'true' && __ENV.K6_ADDRESS_ID) {
      const checkout = http.post(`${baseUrl}/orders/checkout`, JSON.stringify({ addressId: __ENV.K6_ADDRESS_ID, paymentMethod: 'BANK_TRANSFER' }), { ...jsonHeaders(current.token), tags: { endpoint: 'checkout' } });
      checked(checkout, { 'checkout succeeds': (item) => item.status === 201 });
      if (checkout.status === 201) checkoutSuccess.add(1);
      if (checkout.status === 409) checkoutConflict.add(1);
    }
  }
  sleep(Number(__ENV.K6_THINK_TIME || 1));
  if (current && __ENV.K6_LOGOUT_CHECK === 'true') loginAndLogout();
}

export function loginAndLogout() {
  const current = getSession();
  if (!current) return;
  const logout = http.post(`${baseUrl}/auth/logout`, null, { headers: { Authorization: `Bearer ${current.token}` }, tags: { endpoint: 'logout' } });
  checked(logout, { 'logout succeeds': (item) => item.status === 204 });
  if (logout.status === 204) logoutSuccess.add(1);
  session = null;
}
