import { Pool, type PoolClient } from "pg";
import { config } from "./config.js";

export const pool = new Pool({ connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30_000 });

export async function initDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      result JSONB,
      error TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS jobs_status_schedule_idx ON jobs(status, scheduled_for, created_at);
  `);
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
