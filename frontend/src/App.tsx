import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Job = {
  id: string;
  task_type: string;
  status: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  finished_at: string | null;
};

type Stats = { counts: Record<string, number>; total: number };

const API = import.meta.env.VITE_API_BASE ?? "http://localhost:8001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error((await response.json()).detail ?? "Request failed");
  return response.json() as Promise<T>;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats>({ counts: {}, total: 0 });
  const [taskType, setTaskType] = useState("demo.echo");
  const [payload, setPayload] = useState('{"message":"hello from the control plane"}');
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextJobs, nextStats] = await Promise.all([
        request<Job[]>("/api/v1/jobs"),
        request<Stats>("/api/v1/stats"),
      ]);
      setJobs(nextJobs);
      setStats(nextStats);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "API unavailable");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const activeCount = useMemo(
    () => (stats.counts.queued ?? 0) + (stats.counts.running ?? 0),
    [stats],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      await request<Job>("/api/v1/jobs", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ task_type: taskType, payload: parsed }),
      });
      setNotice("Job accepted. The worker will claim it shortly.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not submit job");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    await request<Job>(`/api/v1/jobs/${id}/cancel`, { method: "POST" });
    await refresh();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">Q</span><span>QueueForge</span></div>
        <span className="environment"><i /> local control plane</span>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">ASYNC SYSTEMS / OPERATIONS</p>
          <h1>Make work durable.</h1>
          <p className="lede">Submit reliable jobs, observe their lifecycle, and see retry behavior without opening a terminal.</p>
        </div>
        <div className="hero-chip"><strong>99.99%</strong><span>design target</span></div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card"><span>Total jobs</span><strong>{stats.total}</strong><small>persisted in SQL</small></article>
        <article className="metric-card accent"><span>Active work</span><strong>{activeCount}</strong><small>queued + running</small></article>
        <article className="metric-card"><span>Completed</span><strong>{stats.counts.succeeded ?? 0}</strong><small>worker acknowledgements</small></article>
        <article className="metric-card warning"><span>Failed</span><strong>{stats.counts.failed ?? 0}</strong><small>after retry budget</small></article>
      </section>

      <section className="content-grid">
        <form className="panel composer" onSubmit={submit}>
          <div className="panel-title"><div><p className="eyebrow">COMMAND</p><h2>Submit a job</h2></div><span className="pulse" /></div>
          <label>Task handler<select value={taskType} onChange={(e) => setTaskType(e.target.value)}><option>demo.echo</option><option>demo.sleep</option><option>demo.flaky</option></select></label>
          <label>Payload<textarea value={payload} onChange={(e) => setPayload(e.target.value)} rows={7} spellCheck={false} /></label>
          <button disabled={busy} type="submit">{busy ? "Submitting…" : "Enqueue job  →"}</button>
          {notice && <p className="notice">{notice}</p>}
          <div className="design-note"><span>◎</span><p><strong>Idempotent by default.</strong> Every request receives a unique key so network retries do not create duplicate work.</p></div>
        </form>

        <section className="panel jobs-panel">
          <div className="panel-title"><div><p className="eyebrow">LIVE QUEUE</p><h2>Recent jobs</h2></div><button className="ghost" onClick={() => void refresh()}>Refresh</button></div>
          <div className="table-wrap"><table><thead><tr><th>Job</th><th>Handler</th><th>Status</th><th>Attempts</th><th>Created</th><th /></tr></thead><tbody>
            {jobs.length === 0 ? <tr><td colSpan={6} className="empty">No jobs yet. Submit one to start the worker.</td></tr> : jobs.map((job) => <tr key={job.id}><td><code>{job.id.slice(0, 8)}</code></td><td>{job.task_type}</td><td><span className={`status ${job.status}`}><i />{job.status}</span></td><td>{job.attempts}/{job.max_attempts}</td><td>{formatTime(job.created_at)}</td><td>{["queued", "running"].includes(job.status) && <button className="text-button" onClick={() => void cancel(job.id)}>cancel</button>}</td></tr>)}
          </tbody></table></div>
        </section>
      </section>
      <footer><span>QueueForge / v0.1.0</span><span>REST · SQL · Workers · Metrics</span></footer>
    </main>
  );
}
