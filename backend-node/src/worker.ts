import { config } from "./config.js";
import { initDatabase } from "./db.js";
import { claimJob, completeJob, failJob, recoverQueuedJobs } from "./jobs.js";
import { jobsCompleted, jobsFailed, jobsInFlight } from "./metrics.js";
import { enqueue, queueName, redis } from "./queue.js";
import type { JobRow } from "./types.js";

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function execute(job: JobRow): Promise<Record<string, unknown>> {
  if (job.task_type === "demo.sleep") await sleep(Math.min(Number(job.payload.seconds ?? 100), 2_000));
  if (job.task_type === "demo.flaky" && job.attempts < 2) throw new Error("simulated transient dependency failure");
  return { task_type: job.task_type, echo: job.payload, processed_at: new Date().toISOString() };
}

async function process(jobId: string) {
  const job = await claimJob(jobId);
  if (!job) return;
  jobsInFlight.inc();
  try {
    await completeJob(job.id, await execute(job));
    jobsCompleted.inc();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown worker error";
    await failJob(job, message);
    if (job.attempts >= job.max_attempts) jobsFailed.inc();
    else await enqueue(job.id);
  } finally {
    jobsInFlight.dec();
  }
}

async function main() {
  await initDatabase();
  if (redis.status === "wait") {
    try { await redis.connect(); } catch { /* recovery poll remains available */ }
  }
  while (true) {
    try {
      const queued = await recoverQueuedJobs();
      await Promise.all(queued.map(enqueue));
      const next = redis.status === "ready" ? await redis.brpop(queueName, 1) : null;
      if (next?.[1]) await process(next[1]);
      else if (!queued.length) await sleep(config.workerPollMs);
    } catch (error) {
      console.error("worker loop error", error);
      await sleep(config.workerPollMs);
    }
  }
}

await main();
