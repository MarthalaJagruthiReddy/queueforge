import { performance } from "node:perf_hooks";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:8000";
const requestCount = Number(process.env.REQUESTS ?? 1_000);
const concurrency = Number(process.env.CONCURRENCY ?? 25);

type Sample = { status: number; durationMs: number };

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(2));
}

async function submitJob(index: number): Promise<Sample> {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}/api/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `benchmark-${Date.now()}-${index}` },
      body: JSON.stringify({ task_type: "demo.echo", payload: { benchmark: true, index } }),
    });
    return { status: response.status, durationMs: performance.now() - started };
  } catch {
    return { status: 0, durationMs: performance.now() - started };
  }
}

async function waitForCompletion(target: number): Promise<{ completed: number; drainSeconds: number }> {
  const started = performance.now();
  const deadline = started + 60_000;
  while (performance.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/v1/stats`);
    const stats = await response.json() as { counts?: Record<string, number> };
    const completed = Number(stats.counts?.succeeded ?? 0);
    if (completed >= target) return { completed, drainSeconds: Number(((performance.now() - started) / 1_000).toFixed(3)) };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const response = await fetch(`${baseUrl}/api/v1/stats`);
  const stats = await response.json() as { counts?: Record<string, number> };
  return { completed: Number(stats.counts?.succeeded ?? 0), drainSeconds: Number(((performance.now() - started) / 1_000).toFixed(3)) };
}

async function main(): Promise<void> {
  const started = performance.now();
  const samples: Sample[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < requestCount) {
      const index = next++;
      samples.push(await submitJob(index));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const requestSeconds = (performance.now() - started) / 1_000;
  const successful = samples.filter((sample) => sample.status === 202);
  const errors = samples.length - successful.length;
  const drained = await waitForCompletion(successful.length);
  const latencies = successful.map((sample) => sample.durationMs);
  const result = {
    benchmark: "QueueForge job submission",
    requests: requestCount,
    concurrency,
    endpoint: "POST /api/v1/jobs",
    successful_requests: successful.length,
    errors,
    request_throughput_per_second: Number((successful.length / requestSeconds).toFixed(2)),
    latency_ms: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99) },
    completed_jobs: drained.completed,
    worker_drain_seconds: drained.drainSeconds,
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors > 0 || drained.completed < successful.length) process.exitCode = 1;
}

await main();
