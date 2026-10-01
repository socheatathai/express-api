# Ecommerce API Foundation

TypeScript, Express, PostgreSQL, and Prisma foundation for an ecommerce API. Business features are intentionally not implemented yet.

## Requirements

- Node.js 20.19 or newer
- npm
- Docker Desktop or Docker Engine with Compose

## Setup

```sh
cp .env.example .env
npm install
npm run db:up
npm run db:generate
npm run dev
```

The API listens on `http://localhost:3000` by default. Swagger UI is at `http://localhost:3000/api-docs`. The PostgreSQL container uses the connection string in `.env`.

## Commands

- `npm run dev` starts the TypeScript server with automatic reload.
- `npm run build` generates Prisma Client and compiles TypeScript.
- `npm start` starts the compiled server.
- `npm test` runs the API tests.
- `npm run typecheck` checks TypeScript without emitting files.
- `npm run db:up` / `npm run db:down` starts or stops PostgreSQL.
- `npm run db:generate` generates Prisma Client after schema changes.
- `npm run db:migrate` creates and applies development migrations.
- `npm run db:studio` opens Prisma Studio.

## Structure

```text
src/
  app.ts                 Express app and Swagger setup
  server.ts              Environment loading and server startup
  controllers/           Request handlers
  docs/                  OpenAPI document
  lib/prisma.ts          Prisma PostgreSQL client
  middleware/            Not-found and error handling
  routes/v1/             Versioned API routes
prisma/                  Prisma schema and migrations
test/                    API tests
```

## Ecommerce build plan

Planned feature areas, not implemented: identity and accounts, product catalog, inventory, cart, checkout and payments, orders, shipping, and administration. Build these incrementally after agreeing on requirements; each area should add its schema, service, routes, and tests without putting business logic in route handlers.

The initial Prisma schema is intentionally empty. Add domain models only when their requirements are defined, then use `npm run db:migrate` to create migrations.