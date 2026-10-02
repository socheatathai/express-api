# GZ Buy API

TypeScript, Express, PostgreSQL, and Prisma API for the GZ Buy Cambodia marketplace.

## Requirements

- Node.js 20.19 or newer
- npm
- Docker Desktop or Docker Engine with Compose

## Setup

```sh
cp .env.example .env
npm install
npm run db:up
npm run db:migrate -- --name marketplace_domain
npm run db:generate
npm run db:seed
npm run dev
```

The API listens on `http://localhost:3000` by default. Swagger UI is at `http://localhost:3000/docs`. The PostgreSQL container uses the connection string in `.env`.

## Commands

- `npm run dev` starts the TypeScript server with automatic reload.
- `npm run build` generates Prisma Client and compiles TypeScript.
- `npm start` starts the compiled server.
- `npm test` runs the API tests.
- `npm run typecheck` checks TypeScript without emitting files.
- `npm run db:up` / `npm run db:down` starts or stops PostgreSQL.
- `npm run db:generate` generates Prisma Client after schema changes.
- `npm run db:migrate` creates and applies development migrations.
- `npm run db:seed` inserts fictional development data; it is disabled in production.
- `npm run db:studio` opens Prisma Studio.
- `npm run deploy:up` builds and starts the API, Nginx, and PostgreSQL containers.
- `npm run deploy:down` stops the deployment containers without deleting database data.

## Container deployment

```sh
cp .env.example .env
# Set strong, unique database credentials in .env before deployment.
npm run deploy:up
```

Compose runs a one-off `migrate` service before the API starts. It uses `prisma migrate deploy` and the configured Docker database URL. The API listens on `0.0.0.0` inside its container and runs as the node user. Existing payment-proof volumes must be writable by that user. Upload directories are excluded from the Docker build context.

Nginx is available at `http://localhost:3002` and binds to `127.0.0.1` by default, so it is reachable only from this machine. PostgreSQL is also bound to loopback. The API uses `DATABASE_URL_DOCKER` to reach the `db` service, while local development uses `DATABASE_URL` on `localhost`.

This local setup serves HTTP only and is not publicly exposed. Keep the development secret in `.env` local; replace it with a deployment secret before any server deployment.

The current API host is `localhost`; Swagger is at `http://localhost:3002/docs` through Nginx. The planned public host `api.eivan.com` is deferred to Sprint 12, when DNS and TLS termination will be configured. For a future server deployment, set `API_DOMAIN=api.eivan.com`, update `CORS_ORIGINS`, and configure HTTPS before exposing the service.

## API middleware

- Helmet sets security headers.
- CORS allows only origins listed in `CORS_ORIGINS`; browser credentials are not enabled because auth uses bearer tokens.
- JSON request bodies are limited to 1 MB. `POST`, `PUT`, and `PATCH` API requests must use `application/json`.
- Every request gets an `X-Request-ID`; Nginx replaces client-provided IDs with its own before proxying. Morgan includes the ID in request logs.
- A global in-memory rate limit allows 120 requests per IP every 15 minutes; health checks and CORS preflight are excluded. Authentication endpoints also have a stricter 10-attempt limit per 15 minutes.
- Errors use the `{ "error": { "message": "..." } }` shape. Zod body, params, and query validation can be applied per route; body and params are currently used by auth/address endpoints.
- Address and seller-store ownership are enforced in services. Sprint 8 supports manual `BANK_TRANSFER` payment: the checkout response includes `BANK_TRANSFER_QR_URL`, customers upload proof images, and admins verify or reject proofs.

The default rate limiter uses in-memory storage and is suitable for a single API instance. Use a shared store such as Redis before running multiple API replicas. Payment proofs have format signature checks and a 5 MB file limit; Nginx permits multipart overhead up to 6 MB. Product images remain external URL metadata.

Sprint 1 endpoints:

- `POST /api/v1/auth/register` creates an account and returns a one-hour bearer token.
- `POST /api/v1/auth/login` accepts a phone number or email and password.
- `GET /api/v1/auth/me` returns the authenticated customer profile.
- `/api/v1/addresses` supports authenticated list/create and item get/update/delete operations.
- `GET /api/v1/cart` and `/api/v1/cart/items` support authenticated cart read/add/update/delete operations.
- `GET /api/v1/orders` lists the authenticated customer orders (page, limit, optional status). `GET /api/v1/orders/:orderId` returns owned order details, payment, and shipment status. Foreign orders return 404.
- `POST /api/v1/orders/checkout` validates the cart and address, splits the order by merchant, snapshots checkout data, reserves inventory, and creates the initial payment record atomically.
- `POST /api/v1/payments/:paymentId/proof` accepts a JPEG, PNG, or WebP transfer proof in the `proof` multipart field; `GET` on the same path is owner/admin protected.
- `/api/v1/admin/payments` lists transfer proofs; `/verify` confirms payment and `/reject` cancels the order and releases reservations.

The initial database volume has the stable Docker volume name `express-api_postgres_data` to preserve existing local data across the project rename. The npm startup scripts create it if missing.

For seed account names and the shared local-only password setting, see [prisma/IMPLEMENTATION_GUIDE.md](prisma/IMPLEMENTATION_GUIDE.md). Seeded users and orders are fictional examples, not production fixtures.

## Structure

```text
Dockerfile               Multi-stage, non-root production API image
docker-compose.yml       API, Nginx, and PostgreSQL services
nginx/default.conf       Reverse proxy configuration
src/
  app.ts                 Express app and Swagger setup
  server.ts              Environment loading and server startup
  controllers/           Request handlers
  docs/                  OpenAPI document
  lib/prisma.ts          Prisma PostgreSQL client
  middleware/            Not-found and error handling
  routes/v1/             Versioned API routes
prisma/                  Canonical 16-model schema, migrations, seed, implementation guide
test/                    API tests
```

## Marketplace roadmap

Sprints 1–11 implement customer accounts/addresses, seller onboarding/membership/admin approval, category and product moderation, seller catalog operations, public catalog enrichment, cart management, transactional checkout, manual bank-transfer payment review, merchant fulfillment/cancellation, shipment delivery transitions, and end-to-end/security hardening. Release readiness remains scheduled for Sprint 12.

The canonical Prisma schema contains all 16 MVP model definitions. Sprint 1–11 behavior is implemented for accounts/addresses, merchant onboarding/access, category/product moderation, seller catalog operations, public catalog enrichment, cart operations, transactional checkout, manual payment verification, merchant order fulfillment, shipment delivery tracking, and end-to-end/security hardening. Implement later workflows in vertical slices with services, routes, validation, tests, and OpenAPI documentation.

## Backup and restore

Create a logical backup from the local Compose database with `docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > backup.sql`. Restore into a stopped or disposable target with `cat backup.sql | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`. Store backups outside the repository and verify restores regularly before production use.

## k6 performance tests

The focused scenarios live in `perf/k6`: `load.js` ramps to 500 VUs, `stress.js` ramps through 100, 500, 1000, 2000, and 5000 VUs, and `spike.js` jumps from 100 to 2000 VUs before returning to 100. They share a browse/search/detail/cart flow and include login or registration; set `K6_LOGOUT_CHECK=true` to include logout on each iteration.

Run against a disposable environment with `k6 run perf/k6/load.js`. Set `BASE_URL` without a trailing slash, plus `K6_PHONE` and `K6_PASSWORD` for a reusable test account. Set `K6_VARIANT_ID`, `K6_ADDRESS_ID`, and `K6_ENABLE_CHECKOUT=true` only when intentionally exercising cart and checkout writes. These scenarios create or modify data and should not target production.

For high-VU browse/search runs from one machine, use `K6_SKIP_AUTH=true` so the API's intentional 10-attempt authentication limiter does not become the measured bottleneck. Run login/register/logout separately at a controlled VU count or from distributed load-generator IPs.

For a disposable local load target only, raise `RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_MAX` in that process environment; keep the production defaults of 120 and 10 in deployed environments.

Each run logs a structured `k6_start` event, tracks `auth_success_total`, `logout_success_total`, `checkout_success_total`, `checkout_conflict_total`, and `flow_errors`, and writes a machine-readable summary to `perf/k6/results/{load,stress,spike}.json`. Generated result JSON is ignored by Git.

## API URL convention and seller/admin workflows

Customer resources use `/api/v1/<resource>`. Seller operations use `/api/v1/seller/<resource>` and admin operations use `/api/v1/admin/<resource>`. Seller is the API term; Merchant remains the database model. Sprint 4 adds seller product image, variant, pricing, SKU, and inventory operations.

A user may belong to multiple stores, so onboarding and membership routes include the store ID:

| Method | URL | Access |
|---|---|---|
| POST / GET | `/api/v1/seller/stores` | Authenticated user: apply / list own stores |
| GET | `/api/v1/seller/stores/:merchantId` | Store member |
| GET | `/api/v1/seller/stores/:merchantId/members` | OWNER, MANAGER, STAFF |
| POST | `/api/v1/seller/stores/:merchantId/members` | OWNER; active store |
| PATCH / DELETE | `/api/v1/seller/stores/:merchantId/members/:userId` | OWNER; active store; cannot change OWNER |
| GET | `/api/v1/admin/sellers` | ADMIN; page, limit, optional status filter |
| GET | `/api/v1/admin/sellers/:merchantId` | ADMIN |
| POST | `/api/v1/admin/sellers/:merchantId/approve` | ADMIN; PENDING or SUSPENDED → ACTIVE |
| POST | `/api/v1/admin/sellers/:merchantId/reject` | ADMIN; PENDING → REJECTED |
| POST | `/api/v1/admin/sellers/:merchantId/suspend` | ADMIN; ACTIVE → SUSPENDED |

Apply with `{ "name": "My Store", "slug": "my-store", "phone": "+85512345678" }`. Membership creation takes `{ "userId": "existing-user-id", "role": "MANAGER" }`; role updates accept MANAGER or STAFF. Requests cannot assign OWNER. Application creates the store and OWNER membership atomically; pending stores can be inspected but cannot manage members. No ownership transfer is included in the MVP. Status and submit actions have no business request body; they may be sent without a body.

### Admin provisioning

`User.role` defaults to CUSTOMER. Registration accepts no role, and admin authorization reads the current database role on every request. There is no public admin provisioning endpoint or seeded admin. An operator must promote a trusted existing account using a database administration session:

```sql
UPDATE "User" SET "role" = 'ADMIN', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = '<trusted-user-id>';
```

Use `CUSTOMER` to revoke admin access. Merchant membership roles remain independent of this platform role.

### Sprint 3 catalog and product moderation

| Method | URL | Access |
|---|---|---|
| GET | `/api/v1/categories` | Public |
| GET | `/api/v1/categories/:categoryId` | Public |
| GET | `/api/v1/products` | Public; ACTIVE products only; page, limit, categoryId, search |
| GET | `/api/v1/products/:productId` | Public; only while product and seller are ACTIVE |
| GET / POST | `/api/v1/admin/categories` | ADMIN |
| PATCH / DELETE | `/api/v1/admin/categories/:categoryId` | ADMIN; delete only unused categories |
| GET / POST | `/api/v1/seller/stores/:merchantId/products` | Store member; store must be ACTIVE |
| GET / PATCH | `/api/v1/seller/stores/:merchantId/products/:productId` | Member of the owning store |
| POST | `/api/v1/seller/stores/:merchantId/products/:productId/submit` | Store member; DRAFT or REJECTED product |
| GET | `/api/v1/admin/products` | ADMIN; page, limit, status, merchantId, categoryId |
| GET | `/api/v1/admin/products/:productId` | ADMIN |
| POST | `/api/v1/admin/products/:productId/approve` | ADMIN; PENDING → ACTIVE |
| POST | `/api/v1/admin/products/:productId/reject` | ADMIN; PENDING → REJECTED |

New products start as DRAFT. Submission moves DRAFT/REJECTED to PENDING. Editing an ACTIVE product, image, or variant returns the product to PENDING for review; pending products cannot be edited or viewed publicly. Build the complete catalogue while DRAFT before submitting it. Physical-stock updates do not require product review.

## Payment, stock, and shipment guarantees

Payment uploads, admin review, seller fulfillment, cancellation, and shipment updates run in serializable transactions with a parent-order lock and bounded retries for PostgreSQL serialization/deadlock conflicts. Repeated cancellation and repeated same-state shipment updates do not release or consume stock twice. Rejection cancels all unshipped merchant orders and releases only their live reservations. FAILED payments and CANCELLED orders cannot accept new proofs; start a new checkout instead.

Seller accept/process/ready and shipment creation/status changes require a PAID payment and an active parent order. Physical stock and reserved stock are both reduced once when the courier picks up the shipment. Delivery records `deliveredAt`; pickup records `shippedAt`. Cancelled shipments cannot advance. A parent order becomes COMPLETED when every non-cancelled merchant order is DELIVERED. Cancelled paid portions retain their original charge/snapshots and return `refundRequired: true`; refund settlement remains an operator workflow. FAILED/RETURNED shipments do not automatically restock goods: reconcile actual returned goods before updating physical inventory.

Seller inventory PATCH accepts only `{ "quantity": 10 }`. Sending `reservedQuantity` now returns 400, and reducing physical stock below current reservations returns 409. Reservation changes belong exclusively to checkout/cancellation/pickup. Prices must be positive decimal strings with at most ten integer digits and two fractional digits; checkout rejects totals above 9999999999.99.

The server checks abandoned checkouts every minute. `ORDER_PAYMENT_TIMEOUT_MINUTES` defaults to 1440 (24 hours). Only PENDING payments with no submitted proof expire; PROCESSING proofs keep their reservations until admin review. Proof uploads after an abandoned checkout's deadline are rejected. Adjust this setting to the business's transfer window. Responses omit internal proof storage paths, and replacing a proof removes the previous file after the database commit.

`GET /api/v1/health` is process liveness. `GET /api/v1/health/ready` returns 200 when the database and payment schema can be read, or 503 when unavailable. API and Nginx container health checks use readiness; health endpoints are excluded from rate limits. SIGTERM/SIGINT stop new requests and the expiry timer, drain outstanding work, and disconnect Prisma.

## Regression testing

Tests create and delete fixtures. Run them against a disposable migrated PostgreSQL database, with the connection explicitly overridden:

```sh
DATABASE_URL='postgresql://test-user:test-password@localhost:55439/test-db' \
  AUTH_TOKEN_SECRET='isolated-test-secret-at-least-32-bytes' \
  PASSWORD_HASH_ROUNDS=10 RATE_LIMIT_MAX=10000 AUTH_RATE_LIMIT_MAX=1000 \
  CORS_ORIGINS=http://localhost:5173 \
  node --import tsx --test test/*.test.ts
```

`test/workflow-regressions.test.ts` exercises conflicting payment reviews, concurrent proof replacement, repeated/concurrent cancellation, unpaid fulfillment rejection, protected stock changes, duplicate pickup, simultaneous final delivery, partial cancellation, abandoned-checkout expiry, customer ownership, invalid proof bytes, and concurrent category edits. The original sprint and end-to-end tests remain in place.

For disposable k6 runs, set both rate-limit overrides high enough for the intended workload, even when `K6_SKIP_AUTH=true`. Container runs now receive those settings from Compose. Auto-created users retain credentials for subsequent login/logout cycles. Set a unique numeric `K6_RUN_ID` (up to 12 digits) for repeated runs; the default uses the scenario start timestamp. Existing list response envelopes are retained for client compatibility; customer order lists use `{ orders, total, page, limit }`.
