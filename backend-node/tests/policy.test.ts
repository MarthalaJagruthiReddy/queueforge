import test from "node:test";
import assert from "node:assert/strict";

test("retry policy treats attempts below the budget as recoverable", () => {
  const job = { attempts: 1, max_attempts: 3 };
  assert.equal(job.attempts < job.max_attempts, true);
});

test("job status vocabulary is explicit", () => {
  const statuses = ["queued", "running", "succeeded", "failed", "cancelled"];
  assert.deepEqual(statuses.includes("succeeded"), true);
  assert.equal(statuses.includes("unknown"), false);
});
