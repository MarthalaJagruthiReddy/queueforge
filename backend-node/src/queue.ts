import { Redis } from "ioredis";
import { config } from "./config.js";

export const queueName = "queueforge:jobs";
export const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

export async function enqueue(jobId: string): Promise<void> {
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.lpush(queueName, jobId);
  } catch {
    // PostgreSQL remains the source of truth; the worker's recovery poll finds this job.
  }
}
