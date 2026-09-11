# QueueForge

QueueForge is a small, explainable job platform: clients submit idempotent jobs, an independent Node.js worker claims them, transient failures are retried, and operators can inspect status and metrics from a React dashboard.

## Engineering signals

- REST API with Fastify, TypeScript types, and Zod validation.
- PostgreSQL persistence with transactional row locking and a recovery poll.
- Redis list used as the low-latency dispatch path; PostgreSQL remains the source of truth.
- Idempotency keys prevent duplicate submissions when clients retry requests.
- Node.js worker claims queued jobs with PostgreSQL row-lock semantics (`SKIP LOCKED`).
- Retry budget, durable failure state, cancellation, health checks, and Prometheus metrics.
- React/TypeScript dashboard that polls the API and exposes the operational state.

## Run

```bash
npm install
docker compose up --build
```

Open `http://localhost:8001/docs` for the API. The frontend can be run with:

```bash
npm run dev
```

Set `VITE_API_BASE=http://localhost:8001` if the API is not on the default origin. The Node.js service lives in `backend-node/`.

## Interview discussion

1. Why is the idempotency key stored with a unique database constraint instead of only checked in application memory?
2. What changes are required to make worker leasing safe if a worker crashes after claiming a job?
3. Why should retries use exponential backoff and a dead-letter policy in a production system?
4. Which metrics distinguish a slow downstream dependency from a saturated worker pool?

## Honest benchmark plan

Run 100 jobs with 1, 2, and 4 workers, record throughput, p95 completion latency, duplicate submission rate, and retry recovery rate. Put the measured values in the eventual resume bullet; do not use fabricated numbers.
