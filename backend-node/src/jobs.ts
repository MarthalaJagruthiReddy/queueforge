import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "./db.js";
import type { JobCommand, JobRow } from "./types.js";

const columns = "id, task_type, status, payload, result, error, idempotency_key, attempts, max_attempts, created_at, scheduled_for, started_at, finished_at";

export async function createJob(command: JobCommand, idempotencyKey: string): Promise<JobRow> {
  const id = randomUUID();
  const inserted = await pool.query<JobRow>(`INSERT INTO jobs (id, task_type, payload, idempotency_key, max_attempts) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (idempotency_key) DO NOTHING RETURNING ${columns}`, [id, command.task_type, command.payload, idempotencyKey, command.max_attempts]);
  if (inserted.rows[0]) return inserted.rows[0];
  const existing = await pool.query<JobRow>(`SELECT ${columns} FROM jobs WHERE idempotency_key = $1`, [idempotencyKey]);
  return existing.rows[0];
}

export async function claimJob(jobId: string): Promise<JobRow | null> {
  return withTransaction(async (client: PoolClient) => {
    const found = await client.query<JobRow>(`SELECT ${columns} FROM jobs WHERE id = $1 AND status = 'queued' FOR UPDATE SKIP LOCKED`, [jobId]);
    const job = found.rows[0];
    if (!job) return null;
    const updated = await client.query<JobRow>(`UPDATE jobs SET status='running', attempts=attempts+1, started_at=NOW() WHERE id=$1 RETURNING ${columns}`, [jobId]);
    return updated.rows[0];
  });
}

export async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  await pool.query("UPDATE jobs SET status='succeeded', result=$2, finished_at=NOW() WHERE id=$1", [jobId, result]);
}

export async function failJob(job: JobRow, error: string): Promise<void> {
  const terminal = job.attempts >= job.max_attempts;
  await pool.query("UPDATE jobs SET status=$2, error=$3, finished_at=CASE WHEN $2='failed' THEN NOW() ELSE NULL END WHERE id=$1", [job.id, terminal ? "failed" : "queued", error]);
}

export async function recoverQueuedJobs(): Promise<string[]> {
  const result = await pool.query<{ id: string }>("SELECT id FROM jobs WHERE status='queued' AND scheduled_for <= NOW() ORDER BY created_at LIMIT 50");
  return result.rows.map((row) => row.id);
}
