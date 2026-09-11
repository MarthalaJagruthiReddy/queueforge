import test from "node:test";
import assert from "node:assert/strict";

test("PostgreSQL and Redis support an idempotent job lifecycle", { skip: process.env.INTEGRATION !== "1" }, async () => {
  const { initDatabase, pool } = await import("../src/db.js");
  const { claimJob, completeJob, createJob } = await import("../src/jobs.js");
  const { enqueue, queueName, redis } = await import("../src/queue.js");

  try {
    await initDatabase();
    await pool.query("TRUNCATE jobs");
    if (redis.status === "wait") await redis.connect();

    const command = { task_type: "demo.echo", payload: { source: "integration" }, max_attempts: 3 };
    const idempotencyKey = `integration-${Date.now()}`;
    const first = await createJob(command, idempotencyKey);
    const duplicate = await createJob(command, idempotencyKey);

    assert.equal(duplicate.id, first.id);
    await enqueue(first.id);
    const message = await redis.brpop(queueName, 1);
    assert.equal(message?.[1], first.id);

    const claimed = await claimJob(first.id);
    assert.equal(claimed?.status, "running");
    await completeJob(first.id, { ok: true });

    const stored = await pool.query<{ status: string }>("SELECT status FROM jobs WHERE id = $1", [first.id]);
    assert.equal(stored.rows[0]?.status, "succeeded");
  } finally {
    try { await redis.quit(); } catch { /* Redis may not have connected after a failed setup. */ }
    await pool.end();
  }
});
