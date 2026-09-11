export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type JobRow = {
  id: string;
  task_type: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  idempotency_key: string;
  attempts: number;
  max_attempts: number;
  created_at: Date;
  scheduled_for: Date;
  started_at: Date | null;
  finished_at: Date | null;
};

export type JobCommand = {
  task_type: string;
  payload: Record<string, unknown>;
  max_attempts: number;
};
