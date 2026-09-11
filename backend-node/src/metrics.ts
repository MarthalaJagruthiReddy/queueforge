import { Counter, Gauge, Histogram, Registry } from "prom-client";

export const registry = new Registry();
export const jobsSubmitted = new Counter({ name: "queueforge_jobs_submitted_total", help: "Jobs accepted by the API", registers: [registry] });
export const jobsCompleted = new Counter({ name: "queueforge_jobs_completed_total", help: "Jobs completed successfully", registers: [registry] });
export const jobsFailed = new Counter({ name: "queueforge_jobs_failed_total", help: "Jobs that exhausted retries", registers: [registry] });
export const jobsInFlight = new Gauge({ name: "queueforge_jobs_in_flight", help: "Jobs currently processed by workers", registers: [registry] });
export const requestLatency = new Histogram({ name: "queueforge_http_request_duration_seconds", help: "HTTP request latency", registers: [registry] });
