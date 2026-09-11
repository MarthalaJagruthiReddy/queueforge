import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { z } from "zod";
import { config } from "./config.js";
import { initDatabase, pool } from "./db.js";
import { createJob } from "./jobs.js";
import { jobsSubmitted, registry } from "./metrics.js";
import { enqueue } from "./queue.js";

const commandSchema = z.object({ task_type: z.string().min(1).max(80).default("demo.echo"), payload: z.record(z.string(), z.unknown()).default({}), max_attempts: z.number().int().min(1).max(5).default(3) });

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });
  void app.register(cors, { origin: true });
  void app.register(swagger, { openapi: { info: { title: "QueueForge API", version: "0.1.0", description: "Durable asynchronous jobs and worker operations" } } });
  void app.register(swaggerUI, { routePrefix: "/docs" });

  app.get("/healthz", async () => {
    await pool.query("SELECT 1");
    return { status: "ok", service: "queueforge-node" };
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", registry.contentType);
    return registry.metrics();
  });

  app.post<{ Body: unknown }>("/api/v1/jobs", async (request, reply) => {
    const parsed = commandSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ detail: parsed.error.issues });
    const idempotencyKey = String(request.headers["idempotency-key"] ?? randomUUID());
    const job = await createJob(parsed.data, idempotencyKey);
    await enqueue(job.id);
    jobsSubmitted.inc();
    return reply.code(202).send(job);
  });

  app.get<{ Querystring: { status?: string; limit?: string } }>("/api/v1/jobs", async (request) => {
    const limit = Math.min(Number(request.query.limit ?? 50), 100);
    const values: unknown[] = [];
    const filters = request.query.status ? "WHERE status = $1" : "";
    if (request.query.status) values.push(request.query.status);
    values.push(limit);
    const rows = await pool.query(`SELECT id, task_type, status, payload, result, error, idempotency_key, attempts, max_attempts, created_at, scheduled_for, started_at, finished_at FROM jobs ${filters} ORDER BY created_at DESC LIMIT $${values.length}`, values);
    return rows.rows;
  });

  app.get<{ Params: { jobId: string } }>("/api/v1/jobs/:jobId", async (request, reply) => {
    const result = await pool.query("SELECT id, task_type, status, payload, result, error, idempotency_key, attempts, max_attempts, created_at, scheduled_for, started_at, finished_at FROM jobs WHERE id=$1", [request.params.jobId]);
    if (!result.rows[0]) return reply.code(404).send({ detail: "Job not found" });
    return result.rows[0];
  });

  app.post<{ Params: { jobId: string } }>("/api/v1/jobs/:jobId/cancel", async (request, reply) => {
    const result = await pool.query("UPDATE jobs SET status='cancelled', finished_at=NOW() WHERE id=$1 AND status IN ('queued','running') RETURNING id, task_type, status, payload, result, error, idempotency_key, attempts, max_attempts, created_at, scheduled_for, started_at, finished_at", [request.params.jobId]);
    if (result.rows[0]) return result.rows[0];
    const existing = await pool.query("SELECT status FROM jobs WHERE id=$1", [request.params.jobId]);
    if (!existing.rows[0]) return reply.code(404).send({ detail: "Job not found" });
    return reply.code(409).send({ detail: `Cannot cancel a ${existing.rows[0].status} job` });
  });

  app.get("/api/v1/stats", async () => {
    const result = await pool.query("SELECT status, COUNT(*)::int AS count FROM jobs GROUP BY status");
    const counts = Object.fromEntries(result.rows.map((row) => [row.status, row.count]));
    return { counts, total: Object.values(counts).reduce((sum: number, count) => sum + Number(count), 0) };
  });
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = buildServer();
  await initDatabase();
  await app.listen({ port: config.port, host: "0.0.0.0" });
}
