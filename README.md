# QueueForge

QueueForge is a durable asynchronous job-processing platform. API clients submit idempotent jobs, an independent Node.js worker claims and executes them, transient failures are retried, and operators can inspect job state from a React dashboard.

## Architecture

```mermaid
flowchart TD
    Client["React dashboard or API client"] --> API["Fastify API"]
    API --> DB["PostgreSQL source of truth"]
    API --> Redis["Redis dispatch queue"]
    Worker["Node.js worker"] --> Redis
    Worker --> DB
```

PostgreSQL owns the durable job state. Redis provides a low-latency dispatch path, while the worker uses PostgreSQL row-locking semantics to avoid duplicate claims. The API exposes OpenAPI documentation and Prometheus metrics.

## Features

- Idempotent job submission through a unique `Idempotency-Key`.
- Transactional job creation and worker claims using PostgreSQL.
- Retry budgets, durable failure state, cancellation, and recovery polling.
- Separate API and worker processes for independent scaling.
- React/TypeScript dashboard for job status and operational statistics.
- Health checks, structured logging, Swagger UI, and Prometheus metrics.

## Technology

- Frontend: React, TypeScript, Vite
- API and worker: Node.js, TypeScript, Fastify, Zod
- Data and messaging: PostgreSQL, Redis
- Operations: Docker Compose, GitHub Actions, Prometheus metrics

## Getting started

### Start the services

```bash
npm install
docker compose up --build
```

The API is available at `http://localhost:8001`. Swagger UI is available at `http://localhost:8001/docs`, and Prometheus metrics are exposed at `http://localhost:8001/metrics`.

### Start the frontend

```bash
npm run dev
```

If the API is running on another origin, set `VITE_API_BASE`, for example:

```bash
VITE_API_BASE=http://localhost:8001 npm run dev
```

### Run the Node service locally

```bash
npm ci --prefix backend-node
npm run build --prefix backend-node
npm test --prefix backend-node
```

## API surface

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/jobs` | Submit an idempotent job |
| `GET` | `/api/v1/jobs` | List jobs, optionally filtered by status |
| `GET` | `/api/v1/jobs/:jobId` | Read one job |
| `POST` | `/api/v1/jobs/:jobId/cancel` | Cancel a queued or running job |
| `GET` | `/api/v1/stats` | Read aggregate job counts |
| `GET` | `/healthz` | Check database connectivity and service health |
| `GET` | `/metrics` | Export Prometheus metrics |

## Validation

```bash
npm run build
npm run typecheck --workspace=frontend
npm test --prefix backend-node
```

The repository also includes a GitHub Actions workflow that runs the frontend build, strict typecheck, backend tests, and a PostgreSQL/Redis integration test. To run the integration test locally, start the Compose services and run:

```bash
INTEGRATION=1 \
DATABASE_URL=postgres://queueforge:queueforge@localhost:5432/queueforge \
REDIS_URL=redis://localhost:6379 \
npm run test:integration --prefix backend-node
```

## Repository layout

```text
backend-node/       Fastify API, worker, database, queue, and tests
frontend/            React dashboard
docker-compose.yml  PostgreSQL, Redis, API, and worker services
```

## Next steps

- Add worker leases and heartbeats for crash recovery during long-running jobs.
- Add a dead-letter queue and replay controls to the dashboard.
- Add load-test scenarios for throughput, latency, retries, and duplicate submissions.
