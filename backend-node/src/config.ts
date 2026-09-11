import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://queueforge:queueforge@localhost:5432/queueforge",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  workerPollMs: Number(process.env.WORKER_POLL_MS ?? 500),
};
