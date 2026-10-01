# Example API Foundation

TypeScript, Express, PostgreSQL, and Prisma foundation for a domain-neutral API. Business features are intentionally not implemented yet.

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
- `npm run deploy:up` builds and starts the API, Nginx, and PostgreSQL containers.
- `npm run deploy:down` stops the deployment containers without deleting database data.

## Container deployment

```sh
cp .env.example .env
# Set strong, unique database credentials in .env before deployment.
npm run deploy:up
```

Nginx is available at `http://localhost:8080` by default and forwards traffic to the API on the private Compose network. Set `NGINX_PORT=80` in `.env` to bind Nginx to port 80 on a server. PostgreSQL is not publicly exposed; its host port is bound to loopback for local development only. The API uses `DATABASE_URL_DOCKER` to reach the `db` service, while local development uses `DATABASE_URL` on `localhost`.

This starter serves HTTP only. Configure TLS certificates and HTTPS in Nginx or terminate TLS at a trusted load balancer before exposing it publicly. Use deployment-specific secrets rather than the development values in `.env.example`.

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
prisma/                  Prisma schema and migrations
test/                    API tests
```

## Example API roadmap

The starter currently implements only a health endpoint. Add domain-specific modules after defining their requirements; keep request validation, business logic, persistence, and HTTP routing in separate layers, and cover each behavior with tests and OpenAPI documentation.

The initial Prisma schema is intentionally empty. Add domain models only when their requirements are defined, then use `npm run db:migrate` to create migrations.